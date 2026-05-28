import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type")

    if (type === "source") {
      await prisma.sourceChannel.delete({
        where: { id: params.id },
      })
    } else if (type === "target") {
      await prisma.targetChannel.delete({
        where: { id: params.id },
      })
    } else {
      return NextResponse.json(
        { error: "Invalid channel type. Use ?type=source or ?type=target" },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("DELETE /api/channels/[id] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
