"use client"

import { useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Search, ChevronLeft, ChevronRight, Globe, AlertTriangle, CheckCircle, Trash2 } from "lucide-react"

interface TranslationLog {
  id: string
  originalText: string
  translatedText: string | null
  sourceLanguage: string | null
  detectedLang: string | null
  isAd: boolean
  status: string
  errorMessage: string | null
  targetMessageId: number | null
  forwardedAt: string
  sourceChannel?: {
    username: string
    title: string | null
  } | null
}

export default function LogsPage() {
  const [logs, setLogs] = useState<TranslationLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const limit = 20
  const { toast } = useToast()

  async function fetchLogs() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(statusFilter !== "all" && { status: statusFilter }),
      })
      const res = await fetch(`/api/logs?${params}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch {
      toast({ title: "Error", description: "Failed to load logs", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, statusFilter])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchLogs()
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Translation Logs</h1>
        <p className="text-muted-foreground mt-1">
          View forwarded messages and translation history
        </p>
      </div>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search messages..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary">Search</Button>
            </form>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="forwarded">Forwarded</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No logs found</p>
              <p className="text-sm mt-1">
                Messages will appear here once forwarding is active
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={
                            log.status === "forwarded"
                              ? log.isAd ? "warning" : "success"
                              : log.status === "deleted"
                              ? "outline"
                              : "destructive"
                          }
                        >
                          {log.status === "forwarded" && !log.isAd && <CheckCircle className="h-3 w-3 mr-1" />}
                          {log.isAd && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {log.isAd ? "Pending Review" : log.status}
                        </Badge>
                        {log.sourceChannel && (
                          <span className="text-xs text-muted-foreground">
                            {log.sourceChannel.title || log.sourceChannel.username}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.forwardedAt).toLocaleString()}
                        </span>
                        {log.status === "forwarded" && log.isAd && log.targetMessageId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-destructive hover:text-destructive"
                            onClick={async () => {
                              if (!confirm("Delete this message from the target channel?")) return
                              try {
                                await fetch(`/api/logs/${log.id}`, { method: "DELETE" })
                                toast({ title: "Deleted", description: "Message removed from channel" })
                                fetchLogs()
                              } catch {
                                toast({ title: "Error", description: "Failed to delete", variant: "destructive" })
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        )}
                      </div>
                      <div className="text-sm">
                        <p className="text-muted-foreground line-clamp-2">
                          {log.originalText}
                        </p>
                        {log.errorMessage && (
                          <p className="text-xs text-destructive mt-1">
                            {log.errorMessage}
                          </p>
                        )}
                        {log.translatedText && (
                          <div className="mt-2 p-2 bg-muted/50 rounded text-foreground">
                            <p className="text-xs text-muted-foreground mb-1">
                              Translated
                              {log.detectedLang && ` from ${log.detectedLang.toUpperCase()}`}
                              :
                            </p>
                            <p className="line-clamp-2">{log.translatedText}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
