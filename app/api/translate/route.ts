import { NextResponse } from "next/server"
import { translateText } from "@/lib/openrouter"
import { detectAdByKeywords, detectAdByAI } from "@/lib/ad-detection"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const { text, targetLang, detectAd } = await request.json()

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Text is required" }, { status: 400 })
    }

    const translation = await translateText(text, targetLang || "en")
    const result: {
      translatedText: string
      detectedLang?: string
      isAd?: boolean
      adMethod?: string | null
    } = {
      translatedText: translation.translatedText,
      detectedLang: translation.detectedLang,
    }

    if (detectAd) {
      const keywordMatch = detectAdByKeywords(text)
      if (keywordMatch) {
        result.isAd = true
        result.adMethod = "keyword"
      } else {
        const aiMatch = await detectAdByAI(text)
        result.isAd = aiMatch
        result.adMethod = aiMatch ? "ai" : null
      }
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Translation failed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    service: "OpenRouter Translation",
    model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
    status: "available",
  })
}
