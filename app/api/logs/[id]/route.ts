import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { deleteMessage } from "@/lib/telegram"

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const log = await prisma.translationLog.findUnique({ where: { id } })
    if (!log) {
      return NextResponse.json({ error: "Log not found" }, { status: 404 })
    }

    if (!log.targetChatId || !log.targetMessageId) {
      return NextResponse.json({ error: "No target message to delete" }, { status: 400 })
    }

    await deleteMessage(Number(log.targetChatId), log.targetMessageId)
    await prisma.translationLog.update({
      where: { id },
      data: { status: "deleted" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/logs/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
