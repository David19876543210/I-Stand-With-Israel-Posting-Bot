import { NextResponse } from "next/server"
import { processMessageMetadata, type IncomingMessage } from "@/lib/process-message"

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const msg: IncomingMessage = await request.json()

    if (!msg.sourceChatId) {
      return NextResponse.json({ error: "Missing sourceChatId" }, { status: 400 })
    }

    const meta = await processMessageMetadata(msg)
    if ("error" in meta) {
      return NextResponse.json({ error: meta.error, handled: false })
    }

    const { text, adResult, translatedText, detectedLang, sourceTitle, pairs } = meta

    const targets = pairs
      .map((p) => {
        const chatId = p.targetChannel.telegramChatId
          ? Number(p.targetChannel.telegramChatId)
          : null
        if (!chatId) return null
        return {
          pairId: p.id,
          targetChannelId: p.targetChannel.id,
          targetChatId: chatId,
          targetTitle: p.targetChannel.title || p.targetChannel.username || "Unknown",
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      ok: true,
      processed: true,
      sourceChannelId: meta.sourceChannel.id,
      sourceTitle,
      originalText: text,
      translatedText,
      detectedLang,
      isAd: adResult.isAd,
      adDetectedBy: adResult.method,
      targets,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Process failed" }, { status: 500 })
  }
}
