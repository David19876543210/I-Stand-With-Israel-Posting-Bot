import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")))
    const status = searchParams.get("status")
    const search = searchParams.get("search")

    const where: any = {}
    if (status && status !== "all") {
      where.status = status
    }
    if (search) {
      where.originalText = {
        contains: search,
        mode: "insensitive",
      }
    }

    const [logs, total] = await Promise.all([
      prisma.translationLog.findMany({
        where,
        include: {
          sourceChannel: {
            select: { username: true, title: true },
          },
          targetChannel: {
            select: { username: true, title: true },
          },
        },
        orderBy: { forwardedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.translationLog.count({ where }),
    ])

    const [totalAds, totalTranslations] = await Promise.all([
      prisma.translationLog.count({ where: { isAd: true } }),
      prisma.translationLog.count({
        where: {
          translatedText: { not: null },
          status: "forwarded",
        },
      }),
    ])

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalAds,
      totalTranslations,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error("GET /api/logs error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
