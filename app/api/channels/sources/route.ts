import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const channels = await prisma.sourceChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        title: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ channels })
  } catch (error) {
    console.error("GET /api/channels/sources error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
