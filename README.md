# Telegram Forwarder

Serverless Telegram channel forwarding with AI translation. Built on Next.js 14 + Vercel.

## Architecture

```
                         VERCEL
 ┌──────────────────────────────────────────┐
 │  Next.js 14 Dashboard + API Routes      │
 │                                          │
 │  /api/telegram/webhook ← Bot API msgs   │
 │  /api/ingest          ← Telethon msgs   │
 │  /api/translate       ← Manual translate │
 │  /api/channels/*      ← Channel CRUD    │
 │  /api/logs            ← Translation log │
 │  /api/settings        ← Bot config      │
 │  /api/cron/*          ← Cleanup + retry │
 │                                          │
 │  All logic: ad detect → translate →     │
 │  forward (via Bot API) → log (Prisma)   │
 └──────────────────────┬───────────────────┘
                        │
          ┌─────────────┴─────────────┐
          │         PostgreSQL        │
          │  (Neon / Supabase / RDS)  │
          └───────────────────────────┘

 ┌──────────────────────────────────────────┐
 │  RAILWAY (or any host)                   │
 │                                          │
 │  worker/poller.py                        │
 │  ───────────────────────                 │
 │  • Reads public channels via Telethon    │
 │    (no admin needed for source channels) │
 │  • POSTs raw messages to /api/ingest     │
 │  • Zero business logic (dumb pipe)       │
 └──────────────────────────────────────────┘
```

**Dual-path message ingestion:**
- **Bot API webhook**: For channels where the bot IS admin → Telegram calls Vercel directly
- **Telethon poller**: For channels where you're NOT admin → poller reads via user account and POSTs to Vercel

## Environment Variables

```env
# ── Required ──────────────────────────
TELEGRAM_BOT_TOKEN=1234567890:ABCdef...
OPENROUTER_API_KEY=sk-or-v1-xxxxx
DATABASE_URL=postgresql://...
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-secret

# ── For reading source channels ──────
API_ID=21234426
API_HASH=your_api_hash
PHONE_NUMBER=+972501234567
SESSION_STRING=your_session_string
SOURCE_CHANNEL_IDS=1406113886,1143765178

# ── Poller auth ──────────────────────
INGEST_URL=https://your-app.vercel.app
INGEST_SECRET=choose-a-random-secret

# ── Optional ─────────────────────────
OPENROUTER_MODEL=openai/gpt-oss-120b:free
CRON_SECRET=your-cron-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
```

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your values
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

## Vercel Deployment

1. Push repo to GitHub
2. Import in Vercel → framework auto-detects Next.js
3. Add all env vars (TELEGRAM_BOT_TOKEN, DATABASE_URL, OPENROUTER_API_KEY, etc.)
4. Deploy
5. Go to Settings → "Setup Webhook" to connect bot to Telegram

## Railway Deployment (Poller)

For reading source channels where you're NOT an admin:

```bash
cd worker
railway login
railway init
railway up
```

Add these to Railway:
```
API_ID, API_HASH, PHONE_NUMBER, SESSION_STRING
SOURCE_CHANNEL_IDS=1406113886,1143765178
INGEST_URL=https://your-app.vercel.app
INGEST_SECRET=<match Vercel's INGEST_SECRET>
```

## Creating the Bot (BotFather)

1. Open Telegram → `@BotFather` → `/newbot`
2. Save the token as `TELEGRAM_BOT_TOKEN`
3. Add bot as **admin** to your **target** channel only
4. In dashboard Settings → "Setup Webhook"

## Getting the SESSION_STRING

To generate a session string for the poller:

```bash
pip install telethon
python -c "
from telethon import TelegramClient
from telethon.sessions import StringSession
import asyncio

async def main():
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        await client.start()
        print('SESSION_STRING:', client.session.save())

asyncio.run(main())
```

Set API_ID, API_HASH, and PHONE_NUMBER as env vars first, or hardcode them.

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/telegram/webhook` | Bot API webhook receiver |
| POST | `/api/ingest` | Receive messages from Telethon poller |
| GET/POST | `/api/telegram/set-webhook` | Configure webhook URL |
| POST | `/api/translate` | Translate text via OpenRouter |
| GET/POST | `/api/channels` | Manage channels |
| DELETE | `/api/channels/[id]` | Remove channel |
| POST | `/api/channels/sync` | Resolve chat IDs |
| GET | `/api/logs` | View translation logs |
| GET/POST | `/api/settings` | Bot configuration |
| GET | `/api/cron/cleanup` | Clean logs older than 30d (daily) |
| GET | `/api/cron/retry` | Retry failed forwards (every 6h) |

## Key Points

- **Bot API** sends to target channels (you ARE admin there)
- **Telethon** reads from source channels (you're NOT admin there)
- **All logic** (translation, ad detection, forwarding) runs serverlessly on Vercel
- **Poller** is a dumb pipe — reads messages, POSTs to Vercel, no business logic
- **Source channels** can be added by `@username` or numeric ID
