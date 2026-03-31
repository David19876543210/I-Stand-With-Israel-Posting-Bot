import os

# ── Telegram API ─────────────────────────────────────────────
API_ID = int(os.environ.get("API_ID", 0))
API_HASH = os.environ.get("API_HASH", "")
PHONE_NUMBER = os.environ.get("PHONE_NUMBER", "")

# ── OpenRouter (Gemini AI) ───────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

# ── Channels ─────────────────────────────────────────────────
# Comma-separated list in the env var, e.g: "channel1,channel2"
_sources = os.environ.get("SOURCE_CHANNELS", "")
SOURCE_CHANNELS = [ch.strip() for ch in _sources.split(",") if ch.strip()]

TARGET_CHANNEL = os.environ.get("TARGET_CHANNEL", "")
