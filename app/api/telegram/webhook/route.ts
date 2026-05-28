import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { processMessage, type IncomingMessage } from "@/lib/process-message"
import type { Update } from "@/lib/telegram"

export const maxDuration = 60
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-telegram-bot-api-secret-token")
    if (
      process.env.TELEGRAM_WEBHOOK_SECRET &&
      secret !== process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return NextResponse.json({ ok: true }, { status: 401 })
    }

    const update: Update = await request.json()
    const message = update.message || update.channel_post

    if (!message) {
      return NextResponse.json({ ok: true })
    }

    if (message.chat.type === "private") {
      return NextResponse.json({ ok: true })
    }

    const sourceChannel = await prisma.sourceChannel.findFirst({
      where: {
        OR: [
          { telegramChatId: message.chat.id },
          ...(message.chat.username
            ? [{ username: message.chat.username.replace("@", "") }]
            : []),
        ],
      },
    })

    if (!sourceChannel || !sourceChannel.isActive) {
      return NextResponse.json({ ok: true })
    }

    const incoming: IncomingMessage = {
      sourceChatId: message.chat.id,
      sourceTitle: message.chat.title || sourceChannel.title || undefined,
      text: message.text || message.caption || null,
      messageId: message.message_id,
      photo: message.photo?.length
        ? {
            fileId: message.photo.reduce((a, b) =>
              (a.file_size || 0) > (b.file_size || 0) ? a : b
            ).file_id,
          }
        : null,
      document: message.document
        ? { fileId: message.document.file_id }
        : null,
      hasMedia: !!(
        message.photo?.length ||
        message.document ||
        message.video ||
        message.audio ||
        message.voice ||
        message.animation
      ),
    }

    await processMessage(incoming)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("Webhook error:", err)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
