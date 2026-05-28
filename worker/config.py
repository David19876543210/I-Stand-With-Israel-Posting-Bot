import os

API_ID = int(os.environ.get("API_ID", 0))
API_HASH = os.environ.get("API_HASH", "")
PHONE_NUMBER = os.environ.get("PHONE_NUMBER", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")

_sources = os.environ.get("SOURCE_CHANNELS", "")
SOURCE_CHANNELS = [ch.strip() for ch in _sources.split(",") if ch.strip()]
TARGET_CHANNEL = os.environ.get("TARGET_CHANNEL", "")
