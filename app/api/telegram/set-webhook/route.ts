import { NextRequest, NextResponse } from "next/server"
import { setWebhook, getWebhookInfo, getMe } from "@/lib/telegram"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const botInfo = await getMe()
    const webhookInfo = await getWebhookInfo()

    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || ""
    const webhookUrl = `${baseUrl}/api/telegram/webhook`

    return NextResponse.json({
      bot: botInfo,
      webhook: webhookInfo,
      expectedUrl: webhookUrl,
      configured: webhookInfo.url === webhookUrl,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to get webhook info" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, secretToken } = await request.json()
    const webhookUrl =
      url || `${process.env.NEXTAUTH_URL || process.env.VERCEL_URL || ""}/api/telegram/webhook`
    const token = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET

    await setWebhook(webhookUrl, token, [
      "message",
      "channel_post",
      "edited_message",
      "edited_channel_post",
    ])

    const botInfo = await getMe()
    const webhookInfo = await getWebhookInfo()

    return NextResponse.json({
      success: true,
      bot: botInfo,
      webhook: webhookInfo,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to set webhook" },
      { status: 500 }
    )
  }
}
