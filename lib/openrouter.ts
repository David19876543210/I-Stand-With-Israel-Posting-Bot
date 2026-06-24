export interface OpenRouterConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface OpenRouterResponse {
  id: string
  choices: {
    message: {
      content: string
      role: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

const DEFAULT_CONFIG: Partial<OpenRouterConfig> = {
  model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
  maxTokens: 1024,
  temperature: 0.1,
}

function getConfig(): OpenRouterConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: process.env.OPENROUTER_MODEL || DEFAULT_CONFIG.model,
    maxTokens: DEFAULT_CONFIG.maxTokens,
    temperature: DEFAULT_CONFIG.temperature,
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  overrides?: Partial<OpenRouterConfig>
): Promise<string> {
  const config = { ...getConfig(), ...overrides }

  if (!config.apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
        "X-Title": "Telegram Forwarder",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${error}`)
  }

  const data: OpenRouterResponse = await response.json()
  return data.choices[0]?.message?.content?.trim() || ""
}

function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(text)
}

const FALLBACK_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemini-2.0-flash-lite-preview-02-05:free",
  "mistralai/mistral-small-24b-instruct-2501:free",
  "openai/gpt-4o-mini",
]

export async function translateText(
  text: string,
  targetLang: string = "en"
): Promise<{ translatedText: string; detectedLang: string }> {
  const targetLangName = targetLang === "en" ? "English" : targetLang
  const maxRetries = 2
  let lastError: Error | null = null

  const models = [
    process.env.OPENROUTER_MODEL || FALLBACK_MODELS[0],
    ...FALLBACK_MODELS,
  ]

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const messages: ChatMessage[] = [
          {
            role: "system",
            content: `You are a professional translator specializing in Hebrew and Arabic news. Translate the following text to ${targetLangName}. Focus on the meaning and intent behind the message — use natural, fluent English that reads like a native wrote it. Avoid literal word-for-word translation. If the text is already in ${targetLangName}, respond with "[ALREADY_TARGET_LANG]". Only respond with the translation, no explanations. Translate ALL text including channel names, hashtags, and link labels.`,
          },
          {
            role: "user",
            content: text.slice(0, 2000),
          },
        ]

        const result = await chatCompletion(messages, {
          temperature: 0.1,
          model,
          maxTokens: 4096,
        })

        if (result === "[ALREADY_TARGET_LANG]") {
          return { translatedText: text, detectedLang: targetLang }
        }

        return { translatedText: result, detectedLang: "unknown" }
      } catch (err) {
        lastError = err as Error
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        }
      }
    }
  }

  throw lastError || new Error("Translation failed after all retries and fallback models")
}

export async function detectAd(
  text: string
): Promise<{ isAd: boolean; confidence: string }> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are an ad detector. Respond with only 'YES' if the message is an advertisement, promotion, sponsored content, or trying to sell something. Respond with only 'NO' if it is regular news, information, or genuine content. No explanation.",
    },
    {
      role: "user",
      content: text.slice(0, 500),
    },
  ]

  const result = await chatCompletion(messages, {
    maxTokens: 10,
    temperature: 0,
  })

  const isAd = result.toUpperCase().includes("YES")
  return { isAd, confidence: isAd ? "high" : "low" }
}
