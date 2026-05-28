import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendMessage } from "@/lib/telegram"

export const dynamic = "force-dynamic"
export const maxDuration = 120

async function isAuthorized(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET) return true
  return authHeader === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(request: Request) {
  try {
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const failedLogs = await prisma.translationLog.findMany({
      where: {
        status: "error",
        retryCount: { lt: 3 },
      },
      include: {
        sourceChannel: true,
        targetChannel: true,
      },
      take: 10,
      orderBy: { forwardedAt: "asc" },
    })

    let retried = 0
    for (const log of failedLogs) {
      try {
        if (log.targetChannel?.telegramChatId && log.originalText) {
          await sendMessage(
            Number(log.targetChannel.telegramChatId),
            `_[Retry]_\n${log.originalText.slice(0, 2000)}`
          )
        }

        await prisma.translationLog.update({
          where: { id: log.id },
          data: {
            status: "forwarded",
            retryCount: { increment: 1 },
            errorMessage: null,
          },
        })
        retried++
      } catch {
        await prisma.translationLog.update({
          where: { id: log.id },
          data: { retryCount: { increment: 1 } },
        })
      }
    }

    return NextResponse.json({
      success: true,
      retried,
      remaining: failedLogs.length - retried,
      totalFailed: await prisma.translationLog.count({
        where: { status: "error", retryCount: { lt: 3 } },
      }),
    })
  } catch (err: any) {
    console.error("Retry cron error:", err)
    return NextResponse.json(
      { error: err.message || "Retry failed" },
      { status: 500 }
    )
  }
}
