"""
Lightweight Telethon poller for reading source channels where
the bot is NOT an admin.

Reads messages from source channels via a user account (Telethon)
and POSTs them to the Vercel ingest endpoint for processing.

- Text-only messages: sent to /api/ingest (Vercel forwards via bot)
- Media messages: processed via /api/telegram/process, forwarded via Telethon directly,
  then reported via /api/telegram/report

Environment variables required:
  API_ID, API_HASH, PHONE_NUMBER, SESSION_STRING
  INGEST_URL (your Vercel deployment URL)
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
PROCESS_URL = BASE_URL + "/api/telegram/process"
REPORT_URL = BASE_URL + "/api/telegram/report"
SOURCES_URL = BASE_URL + "/api/channels/sources"
POLLER_SYNC_URL = BASE_URL + "/api/channels/poller-sync"
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
        "sourceChatIdRaw": chat_id,
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


async def send_to_process(payload: dict) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=60) as http:
            resp = await http.post(
                PROCESS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {INGEST_SECRET}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code == 200:
                return resp.json()
            else:
                logger.error(f"Process error {resp.status_code}: {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Process connection error: {e}")
        return None


async def report_forward(data: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post(
                REPORT_URL,
                json=data,
                headers={
                    "Authorization": f"Bearer {INGEST_SECRET}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                logger.error(f"Report error {resp.status_code}: {resp.text}")
                return False
            return True
    except Exception as e:
        logger.error(f"Report connection error: {e}")
        return False


async def sync_channel_to_db(username: str | None, chat_id_raw: int, title: str | None = None) -> bool:
    """Tell the API to store the numeric chat ID for this channel."""
    try:
        body = {"telegramChatId": chat_id_raw}
        if username:
            body["username"] = username
        if title:
            body["title"] = title
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.post(
                POLLER_SYNC_URL,
                json=body,
                headers={"Authorization": f"Bearer {INGEST_SECRET}"},
            )
            if resp.status_code == 200:
                label = username or title or str(chat_id_raw)
                logger.info(f"Synced {label} to DB: chatId={chat_id_raw}")
                return True
            else:
                label = username or title or str(chat_id_raw)
                logger.warning(f"Sync error for {label}: {resp.status_code} {resp.text}")
                return False
    except Exception as e:
        label = username or title or str(chat_id_raw)
        logger.warning(f"Sync connection error for {label}: {e}")
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


async def forward_media_via_telethon(client, message, chat_title, process_result):
    """
    Download media and forward it to each target via Telethon.
    Returns list of results for reporting.
    """
    targets = process_result.get("targets", [])
    if not targets:
        logger.info(f"No targets to forward media to for {chat_title}")
        return []

    # Build translated caption
    source_title = process_result.get("sourceTitle", chat_title)
    original_text = process_result.get("originalText", "")
    translated_text = process_result.get("translatedText")

    if translated_text and translated_text != original_text:
        caption = f"{translated_text}\n\n📢 <i>Source: {source_title}</i>"
    elif original_text:
        caption = f"{original_text}\n\n📢 <i>Source: {source_title}</i>"
    else:
        caption = ""

    # Only proceed if there's media
    if not message.media:
        logger.info(f"No media to forward for {chat_title}")
        return []

    file_bytes = None
    try:
        file_bytes = await client.download_media(message, file=bytes)
        logger.info(f"Downloaded media ({len(file_bytes)} bytes) for telethon forward")
    except Exception as e:
        logger.warning(f"Could not download media: {e}")
        return []

    if not file_bytes:
        return []

    # Determine file extension for send_file
    ext = "bin"
    if hasattr(message.media, "document") and message.media.document:
        mime = getattr(message.media.document, "mime_type", "")
        if "video" in mime:
            ext = "mp4"
        elif "gif" in mime:
            ext = "gif"
        elif "png" in mime:
            ext = "png"
        elif "jpg" in mime or "jpeg" in mime:
            ext = "jpg"

    import io
    results = []
    for t in targets:
        target_chat_id = t["targetChatId"]
        target_title = t.get("targetTitle", str(target_chat_id))
        try:
            entity = await client.get_entity(target_chat_id)
            file_obj = io.BytesIO(file_bytes)
            file_obj.name = f"media.{ext}"
            sent = await client.send_file(entity, file_obj, caption=caption)
            target_msg_id = sent.id
            results.append({
                "targetChannelId": t["targetChannelId"],
                "targetChatId": target_chat_id,
                "targetMessageId": target_msg_id,
            })
            logger.info(f"Telethon forward to {target_title}: message {target_msg_id}")
        except Exception as e:
            logger.warning(f"Telethon forward error to {target_title}: {e}")
            results.append({
                "targetChannelId": t["targetChannelId"],
                "targetChatId": target_chat_id,
                "targetMessageId": None,
                "error": str(e)[:200],
            })
    return results


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

    # Sync newly resolved channels to DB so they have telegramChatId set
    # Sync resolved channels to DB so they have telegramChatId set
    for cid, entity in resolved.items():
        uname = getattr(entity, "username", None)
        title = getattr(entity, "title", None)
        identifier = uname or title or str(cid)
        await sync_channel_to_db(uname, cid, title)

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
        has_media = bool(message.media)

        if has_media:
            # For media messages: process via /api/telegram/process, forward via Telethon
            payload = build_payload(message, chat_id, chat_title)
            payload["hasMedia"] = True
            if chat_username:
                payload["sourceUsername"] = chat_username

            logger.info(f"Processing media message from {chat_title}")
            result = await send_to_process(payload)

            if result and result.get("ok") and result.get("targets"):
                telethon_results = await forward_media_via_telethon(
                    client, message, chat_title, result
                )
                if telethon_results:
                    report_data = {
                        "sourceChannelId": result["sourceChannelId"],
                        "originalText": result.get("originalText", ""),
                        "translatedText": result.get("translatedText"),
                        "detectedLang": result.get("detectedLang"),
                        "isAd": result.get("isAd", False),
                        "adDetectedBy": result.get("adDetectedBy"),
                        "results": telethon_results,
                    }
                    await report_forward(report_data)
                    logger.info(f"Forwarded media message from {chat_title}")
                else:
                    logger.warning(f"No telethon results for {chat_title}")
            elif result and result.get("ok"):
                logger.info(f"Processed but no targets for {chat_title}")
            else:
                logger.warning(f"Process failed for {chat_title}: {result}")
        else:
            # Text-only: use existing ingest flow (Vercel forwards via bot)
            payload = build_payload(message, chat_id, chat_title)
            if chat_username:
                payload["sourceUsername"] = chat_username

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
                            title = getattr(entity, 'title', str(cid))
                            uname = getattr(entity, 'username', None)
                            if uname:
                                asyncio.ensure_future(sync_channel_to_db(uname, cid))
                            logger.info(f"Added new channel: {title}")
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
