export const AUTH_COOKIE_NAME = "session"
export const AUTH_PASSWORD = "Kubgak2580"

export function createSessionCookieContent(): string {
  return "authenticated"
}

export function validateSessionCookie(value: string): boolean {
  return value === "authenticated"
}
