"""
Lightweight Telethon poller for reading source channels where
the bot is NOT an admin.

Reads messages from source channels via a user account (Telethon)
and POSTs them to the Vercel ingest endpoint for processing.

Run this on Railway, a VPS, or any host that supports long-running processes.

Usage:
  pip install telethon httpx python-dotenv
  python poller.py

Environment variables required:
  API_ID, API_HASH, PHONE_NUMBER, SESSION_STRING
  INGEST_URL (your Vercel deployment URL + /api/ingest)
  INGEST_SECRET (shared secret for auth)
  SOURCE_CHANNEL_IDS (comma-separated Telegram chat IDs, used as fallback)
"""

import os
import asyncio
import json
import base64
import logging
import httpx
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path)

from telethon import TelegramClient, events
from telethon.sessions import StringSession


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

BASE_URL = os.environ.get("INGEST_URL", "").rstrip("/")
INGEST_URL = BASE_URL + "/api/ingest"
SOURCES_URL = BASE_URL + "/api/channels/sources"
INGEST_SECRET = os.environ.get("INGEST_SECRET", "")
API_ID = int(os.environ.get("API_ID", 0))
API_HASH = os.environ.get("API_HASH", "")
PHONE_NUMBER = os.environ.get("PHONE_NUMBER", "")
SESSION_STRING = os.environ.get("SESSION_STRING", "")
SOURCE_CHANNEL_IDS = os.environ.get("SOURCE_CHANNEL_IDS",
                                      os.environ.get("SOURCE_CHANNELS", ""))


def strip_minus_100_prefix(val: int) -> int:
    s = str(val)
    if s.startswith("-100"):
        return int(s[4:])
    return abs(val)


def parse_channel_ids(raw: str) -> list[int]:
    ids = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            try:
                ids.append(int(part))
            except ValueError:
                logger.warning(f"Invalid channel ID: {part}")
    return ids


def build_payload(message, chat_id: int, chat_title: str) -> dict:
    text = message.text or message.caption or ""
    source_chat_id = int(f"-100{abs(chat_id)}")
    payload = {
        "sourceChatId": source_chat_id,
        "sourceTitle": chat_title,
        "text": text,
        "messageId": message.id,
        "hasMedia": False,
    }
    return payload


async def send_to_ingest(payload: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                INGEST_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {INGEST_SECRET}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                logger.error(f"Ingest error {resp.status_code}: {resp.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"Ingest connection error: {e}")
        return False


async def fetch_sources_from_api() -> list[dict] | None:
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.get(
                SOURCES_URL,
                headers={"Authorization": f"Bearer {INGEST_SECRET}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                channels = data.get("channels", [])
                logger.info(f"Fetched {len(channels)} source channels from API")
                return channels
            else:
                logger.warning(f"Sources API error {resp.status_code}: {resp.text}")
                return None
    except Exception as e:
        logger.warning(f"Cannot fetch sources from API: {e}")
        return None


def get_channel_identifiers_from_api(channels: list[dict]) -> list[int | str]:
    ids = []
    for ch in channels:
        tid = ch.get("telegramChatId")
        if tid is not None:
            try:
                ids.append(int(tid))
            except (ValueError, TypeError):
                pass
        username = ch.get("username", "")
        if username and not any(str(i) == username for i in ids):
            ids.append(username)
    return ids


async def resolve_channels(client: TelegramClient, identifiers: list) -> dict:
    resolved = {}
    for ident in identifiers:
        try:
            entity = await client.get_entity(ident)
            raw_id = getattr(entity, "id", ident)
            resolved[raw_id] = entity
            logger.info(f"Resolved {ident}: {getattr(entity, 'title', '?')} (id: {raw_id})")
        except Exception as e:
            logger.warning(f"Cannot resolve {ident}: {e}")
    return resolved


async def main():
    if not INGEST_URL or INGEST_URL == "/api/ingest":
        logger.error("INGEST_URL is not configured")
        return

    sources = await fetch_sources_from_api()
    if sources is None or len(sources) == 0:
        logger.info("No channels from API, falling back to SOURCE_CHANNEL_IDS env var")
        channel_ids = parse_channel_ids(SOURCE_CHANNEL_IDS)
        identifiers: list = channel_ids
    else:
        identifiers = get_channel_identifiers_from_api(sources)

    if not identifiers:
        logger.error("No source channels configured")
        return

    session = StringSession(SESSION_STRING) if SESSION_STRING else "poller_session"
    client = TelegramClient(session, API_ID, API_HASH)
    await client.start(phone=PHONE_NUMBER)

    resolved = await resolve_channels(client, identifiers)
    if not resolved:
        logger.error("No channels could be resolved")
        return

    failed_resolve: set[int | str] = set()

    last_message_id = {}
    for cid, entity in resolved.items():
        try:
            msgs = await client.get_messages(entity, limit=1)
            last_message_id[cid] = msgs[0].id if msgs else 0
            logger.info(f"Last message ID for {getattr(entity, 'title', cid)}: {last_message_id[cid]}")
        except Exception as e:
            logger.warning(f"Could not get last message for {cid}: {e}")
            last_message_id[cid] = 0

    async def process_and_send(message, chat, chat_id):
        chat_title = getattr(chat, "title", getattr(chat, "username", str(chat_id)))
        chat_username = getattr(chat, "username", None)
        payload = build_payload(message, chat_id, chat_title)
        if chat_username:
            payload["sourceUsername"] = chat_username

        if message.media and hasattr(message.media, "photo"):
            try:
                file_bytes = await client.download_media(message, file=bytes)
                if file_bytes and len(file_bytes) < 4_000_000:
                    payload["photoData"] = base64.b64encode(file_bytes).decode()
                    payload["hasMedia"] = True
                    logger.info(f"Downloaded photo ({len(file_bytes)} bytes)")
            except Exception as e:
                logger.warning(f"Could not download photo: {e}")
        elif message.media and hasattr(message.media, "document"):
            try:
                file_bytes = await client.download_media(message, file=bytes)
                if file_bytes and len(file_bytes) < 4_000_000:
                    mime = getattr(message.media.document, "mime_type", "application/octet-stream")
                    payload["documentData"] = base64.b64encode(file_bytes).decode()
                    payload["documentMime"] = mime
                    payload["hasMedia"] = True
                    logger.info(f"Downloaded document ({len(file_bytes)} bytes, {mime})")
            except Exception as e:
                logger.warning(f"Could not download document: {e}")

        logger.info(f"Message from {chat_title}: {payload.get('text', '')[:60]}...")
        ok = await send_to_ingest(payload)
        if ok:
            logger.info(f"Sent to ingest: {chat_title}")
        else:
            logger.warning(f"Failed to send: {chat_title}")

    @client.on(events.NewMessage())
    async def handler(event):
        chat = await event.get_chat()
        chat_id = getattr(chat, "id", None)
        if chat_id not in resolved:
            return
        if event.message.id <= last_message_id.get(chat_id, 0):
            return
        last_message_id[chat_id] = event.message.id
        await process_and_send(event.message, chat, chat_id)

    async def refresh_sources():
        while True:
            await asyncio.sleep(300)
            try:
                sources = await fetch_sources_from_api()
                if sources:
                    new_ids = get_channel_identifiers_from_api(sources)
                    current_ids: set[int | str] = set()
                    for e in resolved.values():
                        eid = getattr(e, "id", 0)
                        if isinstance(eid, int):
                            current_ids.add(eid)
                            current_ids.add(int(f"-100{abs(eid)}"))
                        uname = getattr(e, "username", None)
                        if uname:
                            current_ids.add(uname)
                    need_resolve = [
                        i for i in new_ids
                        if i not in current_ids and i not in failed_resolve
                    ]
                    if need_resolve:
                        logger.info(f"New channels detected: {need_resolve}")
                        new_entities = await resolve_channels(client, need_resolve)
                        for cid, entity in new_entities.items():
                            resolved[cid] = entity
                            try:
                                msgs = await client.get_messages(entity, limit=1)
                                last_message_id[cid] = msgs[0].id if msgs else 0
                            except Exception:
                                last_message_id[cid] = 0
                            logger.info(f"Added new channel: {getattr(entity, 'title', cid)}")
                        for ident in need_resolve:
                            if isinstance(ident, str) and not ident.lstrip("-").isdigit():
                                continue
                            norm = strip_minus_100_prefix(int(ident))
                            already_resolved = any(
                                strip_minus_100_prefix(cid) == norm
                                for cid in resolved
                                if isinstance(cid, int)
                            ) or any(
                                ident == getattr(e, "username", None)
                                for e in resolved.values()
                            )
                            if not already_resolved:
                                failed_resolve.add(ident)
                                logger.info(f"Will not retry unresolvable: {ident}")
            except Exception as e:
                logger.warning(f"Source refresh error: {e}")

    async def poll_channels():
        while True:
            for cid, entity in resolved.items():
                try:
                    msgs = await client.get_messages(entity, limit=1)
                    if not msgs:
                        continue
                    msg = msgs[0]
                    if msg.id > last_message_id.get(cid, 0):
                        last_message_id[cid] = msg.id
                        chat = await client.get_entity(cid)
                        logger.info(f"Polled new message from {getattr(chat, 'title', cid)}")
                        await process_and_send(msg, chat, cid)
                except Exception as e:
                    logger.warning(f"Poll error for {cid}: {e}")
            await asyncio.sleep(30)

    logger.info(f"Poller running. Watching {len(resolved)} channels...")
    poll_task = asyncio.create_task(poll_channels())
    refresh_task = asyncio.create_task(refresh_sources())
    await client.run_until_disconnected()
    poll_task.cancel()
    refresh_task.cancel()


if __name__ == "__main__":
    while True:
        try:
            asyncio.run(main())
        except Exception as e:
            logger.error(f"Poller crashed: {e}")
        logger.info("Restarting poller in 30 seconds...")
        import time
        time.sleep(30)
