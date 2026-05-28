import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [sourceChannels, targetChannels, pairs] = await Promise.all([
      prisma.sourceChannel.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.targetChannel.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.forwardingPair.findMany({
        include: {
          sourceChannel: true,
          targetChannel: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

    return NextResponse.json({ sourceChannels, targetChannels, pairs })
  } catch (error) {
    console.error("GET /api/channels error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (body.action === "togglePair") {
      await prisma.forwardingPair.update({
        where: { id: body.pairId },
        data: { isActive: body.isActive },
      })
      return NextResponse.json({ success: true })
    }

    if (body.action === "addPair") {
      const existing = await prisma.forwardingPair.findFirst({
        where: {
          sourceChannelId: body.sourceChannelId,
          targetChannelId: body.targetChannelId,
        },
      })
      if (existing) {
        return NextResponse.json(
          { error: "This forwarding pair already exists" },
          { status: 409 }
        )
      }
      const pair = await prisma.forwardingPair.create({
        data: {
          sourceChannelId: body.sourceChannelId,
          targetChannelId: body.targetChannelId,
        },
      })
      return NextResponse.json(pair, { status: 201 })
    }

    const rawUsername = body.username.replace("@", "").trim()
    const isNumeric = /^\d+$/.test(rawUsername)
    const chatId = isNumeric
      ? BigInt(rawUsername)
      : body.telegramChatId
        ? BigInt(body.telegramChatId)
        : undefined

    if (body.type === "source") {
      const existing = isNumeric
        ? await prisma.sourceChannel.findFirst({
            where: { telegramChatId: chatId },
          })
        : await prisma.sourceChannel.findUnique({
            where: { username: rawUsername },
          })
      if (existing) {
        return NextResponse.json(
          { error: "This source channel already exists" },
          { status: 409 }
        )
      }
      const channel = await prisma.sourceChannel.create({
        data: {
          username: rawUsername,
          title: body.title || null,
          telegramChatId: chatId,
        },
      })
      return NextResponse.json(channel, { status: 201 })
    }

    if (body.type === "target") {
      const existing = isNumeric
        ? await prisma.targetChannel.findFirst({
            where: { telegramChatId: chatId },
          })
        : await prisma.targetChannel.findUnique({
            where: { username: rawUsername },
          })
      if (existing) {
        return NextResponse.json(
          { error: "This target channel already exists" },
          { status: 409 }
        )
      }
      const channel = await prisma.targetChannel.create({
        data: {
          username: rawUsername,
          title: body.title || null,
          telegramChatId: chatId,
        },
      })
      return NextResponse.json(channel, { status: 201 })
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  } catch (error) {
    console.error("POST /api/channels error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
