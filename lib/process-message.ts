import { prisma } from "@/lib/prisma"
import { translateText } from "@/lib/openrouter"
import { isAdvertisement } from "@/lib/ad-detection"
import {
  sendMessage,
  sendPhoto,
  sendPhotoUpload,
  sendDocument,
  sendDocumentUpload,
  copyMessage,
} from "@/lib/telegram"

export interface IncomingMessage {
  sourceChatId: number
  sourceChatIdRaw?: number
  sourceTitle?: string
  sourceUsername?: string
  text?: string | null
  messageId: number
  photo?: { fileId: string; fileSize?: number } | null
  document?: { fileId: string; mimeType?: string } | null
  hasMedia?: boolean
  photoData?: string
  documentData?: string
  documentMime?: string
}

export interface ProcessResult {
  sourceChannelId: string
  sourceTitle: string
  originalText: string
  translatedText: string | null
  detectedLang: string | null
  isAd: boolean
  adDetectedBy: string | null
  pairs: {
    id: string
    targetChatId: number
    targetTitle: string
  }[]
}

function formatBody(
  originalText: string,
  sourceTitle: string,
  translatedText?: string | null
): string {
  if (translatedText && translatedText !== originalText) {
    return `${translatedText}\n\n📢 Source: ${sourceTitle}`
  }
  const body = originalText || ""
  return body ? `${body}\n\n📢 Source: ${sourceTitle}` : ""
}

async function lookupSourceChannel(msg: IncomingMessage) {
  const id = msg.sourceChatId
  const idWithoutPrefix = id < 0 ? Math.abs(id) % 1000000000000 : id
  const idWithPrefix = id > 0 ? -id - 1000000000000 : id

  const orClauses: any[] = [
    { telegramChatId: id },
    { telegramChatId: BigInt(id) },
  ]
  if (msg.sourceUsername) {
    const uname = msg.sourceUsername.replace("@", "").trim()
    orClauses.push({ username: uname })
    orClauses.push({ username: { equals: uname, mode: "insensitive" } })
    orClauses.push({ username: uname.toLowerCase() })
  }
  if (msg.sourceTitle) {
    orClauses.push({ title: msg.sourceTitle })
  }
  if (idWithoutPrefix !== id) {
    orClauses.push({ telegramChatId: idWithoutPrefix })
    orClauses.push({ telegramChatId: BigInt(idWithoutPrefix) })
  }
  if (idWithPrefix !== id) {
    orClauses.push({ telegramChatId: idWithPrefix })
    orClauses.push({ telegramChatId: BigInt(idWithPrefix) })
  }
  if (msg.sourceChatIdRaw !== undefined) {
    orClauses.push({ telegramChatId: msg.sourceChatIdRaw })
    orClauses.push({ telegramChatId: BigInt(msg.sourceChatIdRaw) })
  }
  // Fallback: try matching sourceChatIdRaw as a string username
  if (msg.sourceChatIdRaw !== undefined) {
    orClauses.push({ username: String(msg.sourceChatIdRaw) })
    orClauses.push({ username: String(-1000000000000 - msg.sourceChatIdRaw) })
  }
  if (idWithoutPrefix !== id) {
    orClauses.push({ username: String(idWithoutPrefix) })
  }

  const sourceChannel = await prisma.sourceChannel.findFirst({
    where: { OR: orClauses },
  })
  return sourceChannel
}

export async function processMessageMetadata(msg: IncomingMessage): Promise<{
  sourceChannel: any
  settings: any
  text: string
  adResult: { isAd: boolean; method: string | null }
  translatedText: string | null
  detectedLang: string | null
  sourceTitle: string
  pairs: any[]
} | { error: string }> {
  const sourceChannel = await lookupSourceChannel(msg)

  if (!sourceChannel || !sourceChannel.isActive) {
    return { error: `Source channel not found` }
  }

  await prisma.sourceChannel.update({
    where: { id: sourceChannel.id },
    data: { telegramChatId: BigInt(msg.sourceChatId) },
  })

  const settings = await prisma.botSetting.findUnique({
    where: { id: "singleton" },
  })

  if (!settings?.isRunning) {
    return { error: "Bot is paused" }
  }

  const text = msg.text || ""
  const adResult = await isAdvertisement(
    text,
    settings.adDetectionEnabled,
    settings.aiAdDetection
  )

  let translatedText: string | null = null
  let detectedLang: string | null = null

  if (settings.translationEnabled && text) {
    try {
      const result = await translateText(text)
      translatedText = result.translatedText
      detectedLang = result.detectedLang
    } catch (err) {
      console.error("Translation error:", err)
    }
  }

  const sourceTitle =
    msg.sourceTitle || sourceChannel.title || sourceChannel.username || "Unknown"

  const pairs = await prisma.forwardingPair.findMany({
    where: {
      sourceChannelId: sourceChannel.id,
      isActive: true,
    },
    include: { targetChannel: true },
  })

  return {
    sourceChannel,
    settings,
    text,
    adResult,
    translatedText,
    detectedLang,
    sourceTitle,
    pairs,
  }
}

export async function processMessage(msg: IncomingMessage): Promise<{
  handled: boolean
  skipped?: boolean
  error?: string
}> {
  const meta = await processMessageMetadata(msg)
  if ("error" in meta) {
    if (meta.error === "Bot is paused") {
      return { handled: true, skipped: true }
    }
    return { handled: false }
  }

  const {
    sourceChannel,
    text,
    adResult,
    translatedText,
    detectedLang,
    sourceTitle,
    pairs,
  } = meta

  if (pairs.length === 0) {
    return { handled: true }
  }

  for (const pair of pairs) {
    const target = pair.targetChannel
    const targetChatId = target.telegramChatId
      ? Number(target.telegramChatId)
      : null

    if (!targetChatId) {
      await prisma.translationLog.create({
        data: {
          sourceChannelId: sourceChannel.id,
          targetChannelId: target.id,
          originalText: text.slice(0, 500),
          translatedText: translatedText?.slice(0, 500),
          detectedLang,
          status: "error",
          errorMessage: `Target ${target.username} has no telegramChatId. Sync it in the dashboard.`,
        },
      })
      continue
    }

    try {
      const caption = formatBody(text, sourceTitle, translatedText)
      let targetMsgId: number | undefined

      if (msg.photoData) {
        const buf = Buffer.from(msg.photoData, "base64")
        const sent = await sendPhotoUpload(targetChatId, buf, caption.slice(0, 1024))
        targetMsgId = sent.message_id
      } else if (msg.documentData) {
        const buf = Buffer.from(msg.documentData, "base64")
        const ext = msg.documentMime?.includes("video") ? "mp4" : msg.documentMime?.includes("gif") ? "gif" : "bin"
        const sent = await sendDocumentUpload(targetChatId, buf, caption.slice(0, 1024), ext)
        targetMsgId = sent.message_id
      } else if (msg.photo?.fileId) {
        const sent = await sendPhoto(targetChatId, msg.photo.fileId, caption.slice(0, 1024))
        targetMsgId = sent.message_id
      } else if (msg.document?.fileId) {
        const sent = await sendDocument(targetChatId, msg.document.fileId, caption.slice(0, 1024))
        targetMsgId = sent.message_id
      } else if (msg.hasMedia) {
        const sent = await copyMessage(targetChatId, msg.sourceChatId, msg.messageId, {
          caption: caption.slice(0, 1024),
        })
        targetMsgId = sent.message_id
      } else if (caption) {
        const sent = await sendMessage(targetChatId, caption)
        targetMsgId = sent.message_id
      }

      await prisma.translationLog.create({
        data: {
          sourceChannelId: sourceChannel.id,
          targetChannelId: target.id,
          originalText: text.slice(0, 1000),
          translatedText: translatedText?.slice(0, 1000),
          detectedLang,
          status: "forwarded",
          isAd: adResult.isAd,
          adDetectedBy: adResult.method,
          targetChatId: BigInt(targetChatId),
          targetMessageId: targetMsgId,
        },
      })
    } catch (err: any) {
      console.error(`Forward error to ${target.username}:`, err)
      await prisma.translationLog.create({
        data: {
          sourceChannelId: sourceChannel.id,
          targetChannelId: target.id,
          originalText: text.slice(0, 500),
          translatedText: translatedText?.slice(0, 500),
          detectedLang,
          status: "error",
          errorMessage: err.message?.slice(0, 500) || "Forward failed",
          isAd: adResult.isAd,
          adDetectedBy: adResult.method,
        },
      })
    }
  }

  return { handled: true }
}
