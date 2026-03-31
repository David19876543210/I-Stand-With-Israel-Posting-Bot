import logging
import asyncio
import os
import httpx
from dotenv import load_dotenv
load_dotenv()

from telethon import TelegramClient, events
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
from telethon.sessions import StringSession
from deep_translator import GoogleTranslator
from langdetect import detect, LangDetectException
import config

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

SESSION_STRING = os.environ.get("SESSION_STRING", "")
if SESSION_STRING:
    logger.info("Using StringSession from environment variable")
    session = StringSession(SESSION_STRING)
else:
    logger.info("Using local session file")
    session = "forwarder_session"

client = TelegramClient(session, config.API_ID, config.API_HASH)

AD_KEYWORDS = [
    # English
    "sponsored", "advertisement", "promo", "promotion", "discount", "coupon",
    "buy now", "shop now", "order now", "click here", "limited offer",
    "limited time", "exclusive deal", "special offer", "free trial",
    "sign up", "subscribe now", "follow us", "check out our", "visit our",
    "dm us", "link in bio", "use code", "affiliate", "paid partnership",
    "% off", "sale ends", "flash sale",
    # Hebrew
    "מבצע", "קנה עכשיו", "הזמן עכשיו", "הנחה", "קופון", "לחץ כאן",
    "פרסומת", "ממומן", "מודעה", "הירשם", "הצטרף", "בלעדי",
]


def is_ad_by_keywords(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    for kw in AD_KEYWORDS:
        if kw.lower() in lower:
            logger.info(f"Ad detected by keyword: '{kw}'")
            return True
    return False


async def is_ad_by_ai(text: str) -> bool:
    if not text or len(text.strip()) < 20:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            response = await http.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "google/gemini-flash-1.5",
                    "max_tokens": 10,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "You are an ad detector. Respond with only 'YES' if the message "
                                "is an advertisement, promotion, sponsored content, or trying to "
                                "sell something. Respond with only 'NO' if it is regular news, "
                                "information, or genuine content. No explanation."
                            )
                        },
                        {"role": "user", "content": text[:500]}
                    ]
                }
            )
            result = response.json()
            answer = result["choices"][0]["message"]["content"].strip().upper()
            if "YES" in answer:
                logger.info(f"Ad detected by AI: {text[:60]}...")
                return True
            return False
    except Exception as e:
        logger.error(f"AI ad detection error: {e}")
        return False


async def is_advertisement(text: str) -> bool:
    if is_ad_by_keywords(text):
        return True
    return await is_ad_by_ai(text)


def translate_to_english(text: str) -> str:
    if not text or not text.strip():
        return text
    try:
        lang = detect(text)
        if lang != 'en':
            translated = GoogleTranslator(source='auto', target='en').translate(text)
            return f"{translated}\n\n🌐 _(Translated from {lang.upper()})_"
        return text
    except LangDetectException:
        try:
            return GoogleTranslator(source='auto', target='en').translate(text) + "\n\n🌐 _(Translated)_"
        except Exception as e:
            logger.error(f"Translation fallback error: {e}")
            return text
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text


def format_message(original_text: str, source_channel: str) -> str:
    translated = translate_to_english(original_text or "")
    footer = f"\n\n📢 _Source: {source_channel}_"
    return translated + footer if translated else footer


async def main():
    await client.start(phone=config.PHONE_NUMBER)

    # Resolve source channel IDs
    source_ids = set()
    print("=== Resolving source channels ===")
    for ch in config.SOURCE_CHANNELS:
        try:
            entity = await client.get_entity(ch)
            source_ids.add(entity.id)
            # Also add with -100 prefix variant
            source_ids.add(int(f"-100{entity.id}"))
            print(f"✅ Listening to: {entity.title} (ID: {entity.id})")
        except Exception as e:
            print(f"❌ Could not resolve '{ch}': {e}")

    if not source_ids:
        print("❌ No valid source channels found.")
        return

    try:
        target = await client.get_entity(config.TARGET_CHANNEL)
        target_id = target.id
        print(f"✅ Target channel: {target.title} (ID: {target_id})\n")
    except Exception as e:
        print(f"❌ Could not resolve target channel: {e}")
        return

    print(f"Watching IDs: {source_ids}\n")

    # Catch ALL messages and manually filter by ID
    @client.on(events.NewMessage())
    async def forward_handler(event):
        try:
            chat = await event.get_chat()
            chat_id = getattr(chat, 'id', None)
            chat_title = getattr(chat, 'title', getattr(chat, 'username', 'Unknown'))

            print(f"[DEBUG] Message from: '{chat_title}' (ID: {chat_id})")

            # Manual ID check
            if chat_id not in source_ids:
                return

            message = event.message
            text = message.text or message.caption or ""

            logger.info(f"📨 Matched source! Processing from: {chat_title}")

            if await is_advertisement(text):
                logger.info(f"🚫 Skipped ad from {chat_title}")
                return

            formatted_text = format_message(text, chat_title)

            if message.media:
                if isinstance(message.media, (MessageMediaPhoto, MessageMediaDocument)):
                    await client.send_file(
                        target_id,
                        file=message.media,
                        caption=formatted_text[:1024],
                        parse_mode='markdown'
                    )
                else:
                    await client.forward_messages(target_id, message)
                    if formatted_text.strip():
                        await client.send_message(target_id, formatted_text, parse_mode='markdown')
            else:
                if formatted_text.strip():
                    await client.send_message(target_id, formatted_text, parse_mode='markdown')

            logger.info(f"✅ Forwarded from {chat_title}")

        except Exception as e:
            logger.error(f"Error in forward_handler: {e}")

    logger.info("Bot started. Listening for new messages...")
    print("✅ Bot is running!\n")
    await client.run_until_disconnected()


if __name__ == '__main__':
    asyncio.run(main())
