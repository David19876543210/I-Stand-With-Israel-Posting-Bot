import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { username, telegramChatId } = await request.json()

    if (!username || !telegramChatId) {
      return NextResponse.json({ error: "Missing username or telegramChatId" }, { status: 400 })
    }

    const channel = await prisma.sourceChannel.findFirst({
      where: {
        username: {
          equals: username,
          mode: "insensitive",
        },
      },
    })

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 })
    }

    await prisma.sourceChannel.update({
      where: { id: channel.id },
      data: { telegramChatId: BigInt(telegramChatId), username: username.toLowerCase() },
    })

    return NextResponse.json({ success: true, channelId: channel.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 })
  }
}
