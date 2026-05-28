import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME, AUTH_PASSWORD, createSessionCookieContent } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { password } = await request.json()

    if (password !== AUTH_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    const response = NextResponse.json({ success: true })
    response.cookies.set(AUTH_COOKIE_NAME, createSessionCookieContent(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }
}
