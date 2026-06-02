import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const maxDuration = 30
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { sourceChannelId, originalText, translatedText, detectedLang, isAd, adDetectedBy, results } = body

    if (!sourceChannelId || !Array.isArray(results)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const created = []
    for (const r of results) {
      const log = await prisma.translationLog.create({
        data: {
          sourceChannelId,
          targetChannelId: r.targetChannelId,
          originalText: (originalText || "").slice(0, 1000),
          translatedText: (translatedText || "").slice(0, 1000),
          detectedLang: detectedLang || null,
          status: r.error ? "error" : "forwarded",
          isAd: isAd || false,
          adDetectedBy: adDetectedBy || null,
          targetChatId: r.targetChatId ? BigInt(r.targetChatId) : undefined,
          targetMessageId: r.targetMessageId || undefined,
          errorMessage: r.error || undefined,
        },
      })
      created.push({ id: log.id, status: log.status })
    }

    return NextResponse.json({ ok: true, created: created.length, logs: created })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Report failed" }, { status: 500 })
  }
}
