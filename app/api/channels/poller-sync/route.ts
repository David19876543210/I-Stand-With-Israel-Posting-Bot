import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization")
    if (process.env.INGEST_SECRET && auth !== `Bearer ${process.env.INGEST_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { username, telegramChatId, title } = await request.json()

    if (!telegramChatId) {
      return NextResponse.json({ error: "Missing telegramChatId" }, { status: 400 })
    }

    const channel = await prisma.sourceChannel.findFirst({
      where: {
        OR: [
          username ? { username: { equals: username, mode: "insensitive" } } : {},
          title ? { title: { equals: title, mode: "insensitive" } } : {},
          ...(username && /^\d+$/.test(username)
            ? [{ username: username }]
            : []),
        ].filter((c) => Object.keys(c).length > 0),
      },
    })

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 })
    }

    const updateData: any = { telegramChatId: BigInt(telegramChatId) }
    if (username) updateData.username = username.toLowerCase()
    if (title) updateData.title = title

    await prisma.sourceChannel.update({
      where: { id: channel.id },
      data: updateData,
    })

    return NextResponse.json({ success: true, channelId: channel.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 })
  }
}
