import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getChat } from "@/lib/telegram"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const { channelId, type } = await request.json()

    if (type !== "source" && type !== "target") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }

    let username: string
    let currentTitle: string | null

    if (type === "source") {
      const ch = await prisma.sourceChannel.findUnique({
        where: { id: channelId },
      })
      if (!ch) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 })
      }
      username = ch.username
      currentTitle = ch.title
    } else {
      const ch = await prisma.targetChannel.findUnique({
        where: { id: channelId },
      })
      if (!ch) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 })
      }
      username = ch.username
      currentTitle = ch.title
    }

    let chatInfo
    try {
      chatInfo = await getChat(`@${username}`)
    } catch {
      return NextResponse.json(
        {
          error: `Cannot resolve @${username}. Make sure the bot is added to this channel as an administrator.`,
        },
        { status: 400 }
      )
    }

    if (type === "source") {
      await prisma.sourceChannel.update({
        where: { id: channelId },
        data: {
          telegramChatId: BigInt(chatInfo.id),
          title: chatInfo.title || currentTitle,
        },
      })
    } else {
      await prisma.targetChannel.update({
        where: { id: channelId },
        data: {
          telegramChatId: BigInt(chatInfo.id),
          title: chatInfo.title || currentTitle,
        },
      })
    }

    return NextResponse.json({
      success: true,
      chatInfo: {
        id: chatInfo.id,
        title: chatInfo.title,
        type: chatInfo.type,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    let synced = 0

    const sourcesWithoutChatId = await prisma.sourceChannel.findMany({
      where: { isActive: true, telegramChatId: null },
    })

    for (const ch of sourcesWithoutChatId) {
      try {
        const chatInfo = await getChat(`@${ch.username}`)
        await prisma.sourceChannel.update({
          where: { id: ch.id },
          data: {
            telegramChatId: BigInt(chatInfo.id),
            title: chatInfo.title || ch.title,
          },
        })
        synced++
      } catch {
        // skip
      }
    }

    const targetsWithoutChatId = await prisma.targetChannel.findMany({
      where: { isActive: true, telegramChatId: null },
    })

    for (const ch of targetsWithoutChatId) {
      try {
        const chatInfo = await getChat(`@${ch.username}`)
        await prisma.targetChannel.update({
          where: { id: ch.id },
          data: {
            telegramChatId: BigInt(chatInfo.id),
            title: chatInfo.title || ch.title,
          },
        })
        synced++
      } catch {
        // skip
      }
    }

    const remaining =
      sourcesWithoutChatId.length + targetsWithoutChatId.length - synced

    return NextResponse.json({
      success: true,
      synced,
      remaining,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Bulk sync failed" },
      { status: 500 }
    )
  }
}
