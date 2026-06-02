import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { AUTH_COOKIE_NAME } from "@/lib/auth"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get(AUTH_COOKIE_NAME)
  const isAuth = session?.value === "authenticated"

  // Public paths — no auth needed
  const publicPaths = [
    "/",
    "/api/login",
    "/api/logout",
    "/api/ingest",
    "/api/telegram/webhook",
    "/api/translate",
    "/api/channels/sources",
    "/api/telegram/process",
    "/api/telegram/report",
  ]
  if (publicPaths.includes(pathname)) {
    return NextResponse.next()
  }
  // Protected paths — check auth
  const protectedPatterns = [
    "/dashboard",
    "/channels",
    "/logs",
    "/settings",
    "/api/",
  ]
  const isProtected = protectedPatterns.some((p) => pathname.startsWith(p))

  if (isProtected && !isAuth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/channels/:path*",
    "/logs/:path*",
    "/settings/:path*",
    "/api/:path*",
  ],
}
