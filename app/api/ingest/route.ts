import { NextResponse } from "next/server"
import { processMessage, type IncomingMessage } from "@/lib/process-message"

export const maxDuration = 120
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    const messages: IncomingMessage[] = Array.isArray(body) ? body : [body]

    const results = []
    for (const msg of messages) {
      if (!msg.sourceChatId) {
        results.push({ error: "Missing sourceChatId", handled: false })
        continue
      }
      try {
        const result = await processMessage(msg)
        results.push(result)
      } catch (err: any) {
        results.push({ error: err.message, handled: false })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.filter((r) => r.handled).length,
      total: messages.length,
      results,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Ingest failed" },
      { status: 500 }
    )
  }
}
