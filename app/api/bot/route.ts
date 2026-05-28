import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const settings = await prisma.botSetting.upsert({
      where: { id: "singleton" },
      update: {
        isRunning: body.isRunning,
      },
      create: {
        id: "singleton",
        isRunning: body.isRunning ?? true,
      },
    })

    return NextResponse.json(settings)
  } catch (error) {
    console.error("POST /api/bot error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    return NextResponse.json({ isRunning: settings.isRunning })
  } catch (error) {
    console.error("GET /api/bot error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
