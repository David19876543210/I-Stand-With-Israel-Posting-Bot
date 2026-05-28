import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const result = await prisma.translationLog.deleteMany({
      where: {
        forwardedAt: { lt: thirtyDaysAgo },
        status: { not: "error" },
      },
    })

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Cleaned up ${result.count} logs older than 30 days`,
    })
  } catch (err: any) {
    console.error("Cleanup cron error:", err)
    return NextResponse.json(
      { error: err.message || "Cleanup failed" },
      { status: 500 }
    )
  }
}
