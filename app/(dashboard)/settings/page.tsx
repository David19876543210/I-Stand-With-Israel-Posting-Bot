"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import {
  Save,
  RefreshCw,
  Bot,
  Globe,
  CheckCircle2,
  XCircle,
  Webhook,
} from "lucide-react"

interface BotSettings {
  isRunning: boolean
  adDetectionEnabled: boolean
  aiAdDetection: boolean
  translationEnabled: boolean
}

interface WebhookStatus {
  bot?: { id: number; first_name: string; username?: string }
  webhook?: { url: string; pending_update_count: number; last_error_message?: string }
  configured: boolean
  expectedUrl: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<BotSettings>({
    isRunning: true,
    adDetectionEnabled: true,
    aiAdDetection: true,
    translationEnabled: true,
  })
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const { toast } = useToast()

  async function fetchSettings() {
    try {
      const [settingsRes, webhookRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/telegram/set-webhook"),
      ])
      const settingsData = await settingsRes.json()
      setSettings({
        isRunning: settingsData.isRunning ?? true,
        adDetectionEnabled: settingsData.adDetectionEnabled ?? true,
        aiAdDetection: settingsData.aiAdDetection ?? true,
        translationEnabled: settingsData.translationEnabled ?? true,
      })
      if (webhookRes.ok) {
        setWebhookStatus(await webhookRes.json())
      }
    } catch {
      toast({ title: "Error", description: "Failed to load settings", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error()
      toast({ title: "Settings saved", description: "Bot settings have been updated" })
    } catch {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function setupWebhook() {
    setWebhookLoading(true)
    try {
      const res = await fetch("/api/telegram/set-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error("Failed to set webhook")
      const data = await res.json()
      setWebhookStatus(data)
      toast({ title: "Webhook configured", description: `Bot @${data.bot?.username} is now connected` })
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to configure webhook", variant: "destructive" })
    } finally {
      setWebhookLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure bot behavior and webhook
          </p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Changes
        </Button>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle className="text-lg">Telegram Bot</CardTitle>
          </div>
          <CardDescription>
            Webhook connection status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookStatus ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">
                    @{webhookStatus.bot?.username || "Unknown"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ID: {webhookStatus.bot?.id}
                  </p>
                </div>
                <Badge
                  variant={webhookStatus.configured ? "success" : "warning"}
                  className="ml-auto"
                >
                  {webhookStatus.configured ? "Connected" : "Not Configured"}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Webhook URL</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded max-w-[300px] truncate">
                    {webhookStatus.webhook?.url || "—"}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pending Updates</span>
                  <span>{webhookStatus.webhook?.pending_update_count ?? 0}</span>
                </div>
                {webhookStatus.webhook?.last_error_message && (
                  <div className="flex items-center justify-between">
                    <span className="text-destructive">Last Error</span>
                    <span className="text-destructive text-xs max-w-[300px] truncate">
                      {webhookStatus.webhook.last_error_message}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4" />
              <span>Could not load webhook info. Check TELEGRAM_BOT_TOKEN.</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={setupWebhook}
              disabled={webhookLoading}
            >
              {webhookLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Webhook className="h-4 w-4 mr-2" />
              )}
              {webhookStatus?.configured ? "Reconfigure Webhook" : "Setup Webhook"}
            </Button>
            <Button
              variant="outline"
              onClick={fetchSettings}
              disabled={webhookLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Bot Control</CardTitle>
          <CardDescription>
            Start, pause, and control the forwarding bot
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Bot Status</Label>
              <p className="text-sm text-muted-foreground">
                {settings.isRunning ? "Bot is running and forwarding messages" : "Bot is paused"}
              </p>
            </div>
            <Switch
              checked={settings.isRunning}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, isRunning: checked }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Ad Detection</Label>
              <p className="text-sm text-muted-foreground">
                Filter out promotional and sponsored content
              </p>
            </div>
            <Switch
              checked={settings.adDetectionEnabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, adDetectionEnabled: checked }))
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">AI-Powered Ad Detection</Label>
              <p className="text-sm text-muted-foreground">
                Use OpenRouter AI to detect sophisticated ads
              </p>
            </div>
            <Switch
              checked={settings.aiAdDetection}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, aiAdDetection: checked }))
              }
              disabled={!settings.adDetectionEnabled}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Translation</Label>
              <p className="text-sm text-muted-foreground">
                Automatically translate non-English posts to English
              </p>
            </div>
            <Switch
              checked={settings.translationEnabled}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, translationEnabled: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Environment</CardTitle>
          <CardDescription>
            Configured environment variables
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>OpenRouter Model</Label>
            <Input
              value={process.env.NEXT_PUBLIC_OPENROUTER_MODEL || "openai/gpt-oss-120b:free"}
              readOnly
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Set via OPENROUTER_MODEL env var
            </p>
          </div>
          <div className="space-y-2">
            <Label>Bot Token</Label>
            <Input
              value={webhookStatus?.bot?.username
                ? `@${webhookStatus.bot.username} (ID: ${webhookStatus.bot.id})`
                : "Not configured"}
              readOnly
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              Set via TELEGRAM_BOT_TOKEN env var
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Setup Guide</CardTitle>
          <CardDescription>
            How to create and configure your Telegram bot
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                1
              </div>
              <div>
                <p className="font-medium">Create a bot via BotFather</p>
                <p className="text-muted-foreground mt-0.5">
                  Open Telegram, search for @BotFather, and send /newbot.
                  Follow the prompts and save the API token.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                2
              </div>
              <div>
                <p className="font-medium">Add bot to your channels</p>
                <p className="text-muted-foreground mt-0.5">
                  Add the bot as an <strong>administrator</strong> to both
                  source and target channels. It needs at minimum the
                  &quot;Post Messages&quot; permission.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                3
              </div>
              <div>
                <p className="font-medium">Set TELEGRAM_BOT_TOKEN</p>
                <p className="text-muted-foreground mt-0.5">
                  Add the token from BotFather to your environment variables
                  as TELEGRAM_BOT_TOKEN.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                4
              </div>
              <div>
                <p className="font-medium">Click &quot;Setup Webhook&quot;</p>
                <p className="text-muted-foreground mt-0.5">
                  Click the button above to register your Vercel deployment URL
                  as the bot&apos;s webhook endpoint.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
