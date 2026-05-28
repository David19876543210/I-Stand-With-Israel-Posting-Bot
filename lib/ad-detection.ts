import { chatCompletion } from "./openrouter"

const AD_KEYWORDS = [
  "sponsored",
  "advertisement",
  "promo",
  "promotion",
  "discount",
  "coupon",
  "buy now",
  "shop now",
  "order now",
  "click here",
  "limited offer",
  "limited time",
  "exclusive deal",
  "special offer",
  "free trial",
  "sign up",
  "subscribe now",
  "follow us",
  "check out our",
  "visit our",
  "dm us",
  "link in bio",
  "use code",
  "affiliate",
  "paid partnership",
  "% off",
  "sale ends",
  "flash sale",
  "מבצע",
  "קנה עכשיו",
  "הזמן עכשיו",
  "הנחה",
  "קופון",
  "לחץ כאן",
  "פרסומת",
  "ממומן",
  "מודעה",
  "הירשם",
  "הצטרף",
  "בלעדי",
]

export function detectAdByKeywords(text: string | null | undefined): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  for (const kw of AD_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return true
    }
  }
  return false
}

export async function detectAdByAI(
  text: string | null | undefined
): Promise<boolean> {
  if (!text || text.trim().length < 20) return false

  try {
    const result = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You are an ad detector. Respond with only 'YES' if the message is an advertisement, promotion, sponsored content, or trying to sell something. Respond with only 'NO' if it is regular news, information, or genuine content. No explanation.",
        },
        { role: "user", content: text.slice(0, 500) },
      ],
      { maxTokens: 10, temperature: 0 }
    )
    return result.toUpperCase().includes("YES")
  } catch {
    return false
  }
}

export async function isAdvertisement(
  text: string | null | undefined,
  adDetectionEnabled: boolean,
  aiAdDetection: boolean
): Promise<{ isAd: boolean; method: string | null }> {
  if (!adDetectionEnabled) return { isAd: false, method: null }

  if (detectAdByKeywords(text)) {
    return { isAd: true, method: "keyword" }
  }

  if (aiAdDetection) {
    const aiResult = await detectAdByAI(text)
    if (aiResult) {
      return { isAd: true, method: "ai" }
    }
  }

  return { isAd: false, method: null }
}
