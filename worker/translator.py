import os
import httpx
import logging

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-oss-120b:free")

AD_KEYWORDS = [
    "sponsored", "advertisement", "promo", "promotion", "discount", "coupon",
    "buy now", "shop now", "order now", "click here", "limited offer",
    "limited time", "exclusive deal", "special offer", "free trial",
    "sign up", "subscribe now", "follow us", "check out our", "visit our",
    "dm us", "link in bio", "use code", "affiliate", "paid partnership",
    "% off", "sale ends", "flash sale",
    "מבצע", "קנה עכשיו", "הזמן עכשיו", "הנחה", "קופון", "לחץ כאן",
    "פרסומת", "ממומן", "מודעה", "הירשם", "הצטרף", "בלעדי",
]


async def openrouter_chat_completion(messages, max_tokens=1024, temperature=0.1):
    if not OPENROUTER_API_KEY:
        raise ValueError("OPENROUTER_API_KEY is not configured")

    async with httpx.AsyncClient(timeout=30) as http:
        response = await http.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": os.environ.get("NEXTAUTH_URL", "http://localhost:3000"),
                "X-Title": "Telegram Forwarder",
            },
            json={
                "model": OPENROUTER_MODEL,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": messages,
            }
        )

        if response.status_code != 200:
            raise ValueError(f"OpenRouter API error ({response.status_code}): {response.text}")

        result = response.json()
        return result["choices"][0]["message"]["content"].strip()


def is_advertisement(text, use_ai=True):
    if not text:
        return False

    lower = text.lower()
    for kw in AD_KEYWORDS:
        if kw.lower() in lower:
            logger.info(f"Ad detected by keyword: '{kw}'")
            return True

    return False


async def detect_ad_ai(text):
    if not text or len(text.strip()) < 20:
        return False

    try:
        result = await openrouter_chat_completion(
            [
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
            ],
            max_tokens=10,
            temperature=0,
        )
        return "YES" in result.upper()
    except Exception as e:
        logger.error(f"AI ad detection error: {e}")
        return False


async def openrouter_translate(text, target_lang="en"):
    if not text or not text.strip():
        return {"translated_text": text, "detected_lang": "en"}

    try:
        result = await openrouter_chat_completion(
            [
                {
                    "role": "system",
                    "content": (
                        f"You are a professional translator. Translate the following text "
                        f"to {'English' if target_lang == 'en' else target_lang}. "
                        f"Only respond with the translation, no explanations. "
                        f"If the text is already in {'English' if target_lang == 'en' else target_lang}, "
                        f"respond with '[ALREADY_TARGET_LANG]'."
                    )
                },
                {"role": "user", "content": text[:2000]}
            ],
            temperature=0.1,
        )

        if result == "[ALREADY_TARGET_LANG]":
            return {"translated_text": text, "detected_lang": target_lang}

        return {"translated_text": result, "detected_lang": "unknown"}
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return {"translated_text": text, "detected_lang": "en"}


def translate_to_english(text):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        future = asyncio.run_coroutine_threadsafe(
            openrouter_translate(text), loop
        )
        return future.result()
    else:
        return loop.run_until_complete(openrouter_translate(text))
