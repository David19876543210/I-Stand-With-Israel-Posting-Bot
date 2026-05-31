const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ""
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
}

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured")
  }
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data: TelegramResponse<T> = await res.json()
  if (!data.ok) {
    throw new Error(`Telegram API error (${method}): ${data.description}`)
  }
  return data.result as T
}

export interface WebhookInfo {
  url: string
  has_custom_certificate: boolean
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
  max_connections?: number
  allowed_updates?: string[]
}

export interface User {
  id: number
  is_bot: boolean
  first_name: string
  username?: string
}

export interface Chat {
  id: number
  type: "private" | "group" | "supergroup" | "channel"
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface Message {
  message_id: number
  from?: User
  chat: Chat
  date: number
  text?: string
  caption?: string
  photo?: PhotoSize[]
  document?: Document
  video?: Video
  audio?: Audio
  voice?: Voice
  animation?: Animation
}

export interface PhotoSize {
  file_id: string
  file_unique_id: string
  file_size?: number
  width: number
  height: number
}

export interface Document {
  file_id: string
  file_unique_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface Video {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  mime_type?: string
  file_size?: number
}

export interface Audio {
  file_id: string
  file_unique_id: string
  duration: number
  performer?: string
  title?: string
  mime_type?: string
  file_size?: number
}

export interface Voice {
  file_id: string
  file_unique_id: string
  duration: number
  mime_type?: string
  file_size?: number
}

export interface Animation {
  file_id: string
  file_unique_id: string
  width: number
  height: number
  duration: number
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface Update {
  update_id: number
  message?: Message
  channel_post?: Message
  edited_message?: Message
  edited_channel_post?: Message
}

export async function setWebhook(
  url: string,
  secretToken?: string,
  allowedUpdates?: string[]
): Promise<boolean> {
  const body: Record<string, unknown> = { url }
  if (secretToken) body.secret_token = secretToken
  if (allowedUpdates) body.allowed_updates = allowedUpdates
  await call("setWebhook", body)
  return true
}

export async function deleteWebhook(): Promise<boolean> {
  await call("deleteWebhook")
  return true
}

export async function getWebhookInfo(): Promise<WebhookInfo> {
  return call<WebhookInfo>("getWebhookInfo")
}

export async function getMe(): Promise<User> {
  return call<User>("getMe")
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: {
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
    disable_web_page_preview?: boolean
    disable_notification?: boolean
    reply_to_message_id?: number
  }
): Promise<Message> {
  return call<Message>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options?.parse_mode ?? "HTML",
    disable_web_page_preview: options?.disable_web_page_preview ?? true,
    disable_notification: options?.disable_notification,
    reply_to_message_id: options?.reply_to_message_id,
  })
}

export async function forwardMessage(
  chatId: number | string,
  fromChatId: number | string,
  messageId: number,
  disableNotification?: boolean
): Promise<Message> {
  return call<Message>("forwardMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    disable_notification: disableNotification,
  })
}

export async function copyMessage(
  chatId: number | string,
  fromChatId: number | string,
  messageId: number,
  options?: {
    caption?: string
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
    disable_notification?: boolean
  }
): Promise<Message> {
  return call<Message>("copyMessage", {
    chat_id: chatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    caption: options?.caption,
    parse_mode: options?.parse_mode ?? "HTML",
    disable_notification: options?.disable_notification,
  })
}

export async function sendPhoto(
  chatId: number | string,
  photo: string,
  caption?: string,
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
): Promise<Message> {
  return call<Message>("sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: parseMode ?? "HTML",
  })
}

export async function sendDocument(
  chatId: number | string,
  document: string,
  caption?: string,
  parseMode?: "HTML" | "Markdown" | "MarkdownV2"
): Promise<Message> {
  return call<Message>("sendDocument", {
    chat_id: chatId,
    document,
    caption,
    parse_mode: parseMode ?? "HTML",
  })
}

export async function sendPhotoUpload(
  chatId: number | string,
  buffer: Buffer,
  caption?: string
): Promise<Message> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured")
  const form = new FormData()
  form.append("chat_id", String(chatId))
  form.append("photo", new Blob([new Uint8Array(buffer)]), "photo.jpg")
  if (caption) form.append("caption", caption)
  form.append("parse_mode", "HTML")
  const res = await fetch(`${API_BASE}/sendPhoto`, { method: "POST", body: form })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram API error (sendPhoto): ${data.description}`)
  return data.result
}

export async function sendDocumentUpload(
  chatId: number | string,
  buffer: Buffer,
  caption?: string,
  ext: string = "bin"
): Promise<Message> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not configured")
  const form = new FormData()
  form.append("chat_id", String(chatId))
  form.append("document", new Blob([new Uint8Array(buffer)]), `file.${ext}`)
  if (caption) form.append("caption", caption)
  form.append("parse_mode", "HTML")
  const res = await fetch(`${API_BASE}/sendDocument`, { method: "POST", body: form })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram API error (sendDocument): ${data.description}`)
  return data.result
}

export async function getChat(
  chatId: number | string
): Promise<Chat> {
  return call<Chat>("getChat", { chat_id: chatId })
}

export async function getChatMemberCount(
  chatId: number | string
): Promise<number> {
  return call<number>("getChatMemberCount", { chat_id: chatId })
}

export async function deleteMessage(
  chatId: number | string,
  messageId: number
): Promise<boolean> {
  await call("deleteMessage", { chat_id: chatId, message_id: messageId })
  return true
}

export async function leaveChat(
  chatId: number | string
): Promise<boolean> {
  await call("leaveChat", { chat_id: chatId })
  return true
}
