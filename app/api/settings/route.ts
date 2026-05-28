import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    let settings = await prisma.botSetting.findUnique({
      where: { id: "singleton" },
    })

    if (!settings) {
      settings = await prisma.botSetting.create({
        data: { id: "singleton" },
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("GET /api/settings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { isRunning, adDetectionEnabled, aiAdDetection, translationEnabled } = body

    const settings = await prisma.botSetting.upsert({
      where: { id: "singleton" },
      update: {
        ...(typeof isRunning === "boolean" && { isRunning }),
        ...(typeof adDetectionEnabled === "boolean" && { adDetectionEnabled }),
        ...(typeof aiAdDetection === "boolean" && { aiAdDetection }),
        ...(typeof translationEnabled === "boolean" && { translationEnabled }),
      },
      create: {
        id: "singleton",
        isRunning: isRunning ?? true,
        adDetectionEnabled: adDetectionEnabled ?? true,
        aiAdDetection: aiAdDetection ?? true,
        translationEnabled: translationEnabled ?? true,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error("POST /api/settings error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
