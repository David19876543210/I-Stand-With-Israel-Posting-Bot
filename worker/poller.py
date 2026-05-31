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
  SOURCE_CHANNEL_IDS (comma-separated Telegram chat IDs)
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

INGEST_URL = os.environ.get("INGEST_URL", "").rstrip("/") + "/api/ingest"
INGEST_SECRET = os.environ.get("INGEST_SECRET", "")
API_ID = int(os.environ.get("API_ID", 0))
API_HASH = os.environ.get("API_HASH", "")
PHONE_NUMBER = os.environ.get("PHONE_NUMBER", "")
SESSION_STRING = os.environ.get("SESSION_STRING", "")
SOURCE_CHANNEL_IDS = os.environ.get("SOURCE_CHANNEL_IDS",
                                      os.environ.get("SOURCE_CHANNELS", ""))


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
    # Telethon returns internal channel IDs (e.g. 1406113886).
    # Bot API uses -100 prefix (e.g. -1001406113886).
    source_chat_id = int(f"-100{abs(chat_id)}")
    # Don't forward media from poller — Telethon IDs can't be used
    # with the Bot API, and the bot has no access to source channels.
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


async def main():
    channel_ids = parse_channel_ids(SOURCE_CHANNEL_IDS)
    if not channel_ids:
        logger.error("No valid SOURCE_CHANNEL_IDS found")
        return

    if not INGEST_URL or INGEST_URL == "/api/ingest":
        logger.error("INGEST_URL is not configured")
        return

    logger.info(f"Watching {len(channel_ids)} channels: {channel_ids}")
    logger.info(f"Ingest URL: {INGEST_URL}")

    session = StringSession(SESSION_STRING) if SESSION_STRING else "poller_session"
    client = TelegramClient(session, API_ID, API_HASH)
    await client.start(phone=PHONE_NUMBER)

    resolved = {}
    for cid in channel_ids:
        try:
            entity = await client.get_entity(cid)
            raw_id = getattr(entity, "id", cid)
            resolved[raw_id] = entity
            logger.info(f"Resolved {cid}: {getattr(entity, 'title', '?')} (id: {raw_id})")
        except Exception as e:
            logger.error(f"Cannot resolve {cid}: {e}")

    if not resolved:
        logger.error("No channels could be resolved")
        return

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

    logger.info("Poller running. Listening for new messages...")
    task = asyncio.create_task(poll_channels())
    await client.run_until_disconnected()
    task.cancel()


if __name__ == "__main__":
    while True:
        try:
            asyncio.run(main())
        except Exception as e:
            logger.error(f"Poller crashed: {e}")
        logger.info("Restarting poller in 30 seconds...")
        import time
        time.sleep(30)
