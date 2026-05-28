"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  MessageSquare,
  Activity,
  Languages,
  AlertTriangle,
  Play,
  Pause,
  ExternalLink,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"

interface Stats {
  totalSourceChannels: number
  totalTargetChannels: number
  totalForwarded: number
  totalAdsBlocked: number
  totalTranslations: number
  isRunning: boolean
  recentLogs: Array<{
    id: string
    originalText: string
    status: string
    forwardedAt: string
    sourceChannel?: { username: string }
  }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const { toast } = useToast()

  async function fetchStats() {
    try {
      const res = await fetch("/api/settings")
      const settings = await res.json()
      const [channelsRes, logsRes] = await Promise.all([
        fetch("/api/channels"),
        fetch("/api/logs?limit=5"),
      ])
      const channels = await channelsRes.json()
      const logs = await logsRes.json()

      setStats({
        totalSourceChannels: channels.sourceChannels?.length || 0,
        totalTargetChannels: channels.targetChannels?.length || 0,
        totalForwarded: logs.total || 0,
        totalAdsBlocked: logs.totalAds || 0,
        totalTranslations: logs.totalTranslations || 0,
        isRunning: settings.isRunning ?? true,
        recentLogs: logs.logs || [],
      })
    } catch {
      toast({ title: "Error", description: "Failed to load dashboard", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  async function toggleBot() {
    setToggling(true)
    try {
      const res = await fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRunning: !stats?.isRunning }),
      })
      if (!res.ok) throw new Error()
      setStats((prev) => prev ? { ...prev, isRunning: !prev.isRunning } : prev)
      toast({
        title: stats?.isRunning ? "Bot paused" : "Bot resumed",
        description: stats?.isRunning ? "Forwarding has been paused" : "Forwarding is now active",
      })
    } catch {
      toast({ title: "Error", description: "Failed to toggle bot", variant: "destructive" })
    } finally {
      setToggling(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const statCards = [
    {
      title: "Source Channels",
      value: stats?.totalSourceChannels ?? 0,
      icon: MessageSquare,
      description: "Active sources",
    },
    {
      title: "Forwarded",
      value: stats?.totalForwarded ?? 0,
      icon: Activity,
      description: "Total posts forwarded",
    },
    {
      title: "Translations",
      value: stats?.totalTranslations ?? 0,
      icon: Languages,
      description: "Translated posts",
    },
    {
      title: "Ads Blocked",
      value: stats?.totalAdsBlocked ?? 0,
      icon: AlertTriangle,
      description: "Blocked by filter",
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your Telegram channel forwarding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={stats?.isRunning ? "success" : "secondary"} className="text-sm px-3 py-1">
            {stats?.isRunning ? "Running" : "Paused"}
          </Badge>
          <Button
            variant={stats?.isRunning ? "outline" : "default"}
            onClick={toggleBot}
            disabled={toggling}
          >
            {toggling ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
            ) : stats?.isRunning ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {stats?.isRunning ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/channels">
                <MessageSquare className="h-4 w-4 mr-2" />
                Manage Channels
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/logs">
                <Activity className="h-4 w-4 mr-2" />
                View Forwarding Logs
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href="/settings">
                <SettingsIcon className="h-4 w-4 mr-2" />
                Bot Settings
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.recentLogs && stats.recentLogs.length > 0 ? (
              <div className="space-y-3">
                {stats.recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <Badge
                      variant={log.status === "forwarded" ? "success" : "warning"}
                      className="mt-0.5 shrink-0"
                    >
                      {log.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-muted-foreground">
                        {log.originalText?.slice(0, 80)}...
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(log.forwardedAt).toLocaleDateString()}
                        {log.sourceChannel && ` · ${log.sourceChannel.username}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No activity yet. Configure channels to start forwarding.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import { Settings } from "lucide-react"

function SettingsIcon(props: any) {
  return <Settings {...props} />
}
