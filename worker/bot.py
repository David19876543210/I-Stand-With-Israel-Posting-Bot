"""
⚠️  This file is kept as a reference only.

The Telegram bot now runs as a serverless webhook on Vercel.

Architecture:
  Telegram → Webhook → /api/telegram/webhook → translate → forward → log

All logic has been migrated to:
  - lib/telegram.ts        (Telegram Bot API wrapper)
  - lib/ad-detection.ts    (Ad keyword + AI detection)
  - lib/openrouter.ts      (OpenRouter translation)
  - app/api/telegram/webhook/route.ts (webhook handler)

To run locally:
  1. Set TELEGRAM_BOT_TOKEN in .env
  2. npm run dev
  3. Use ngrok or similar to expose localhost
  4. POST to /api/telegram/set-webhook to configure the webhook URL
"""

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("This bot now runs as a Vercel serverless function.")
logger.info("See app/api/telegram/webhook/route.ts for the handler.")
