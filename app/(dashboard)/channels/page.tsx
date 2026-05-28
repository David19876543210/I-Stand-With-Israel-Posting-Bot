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
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import {
  Plus,
  Trash2,
  ExternalLink,
  MessageSquare,
  ArrowRight,
  RefreshCw,
} from "lucide-react"

interface SourceChannel {
  id: string
  username: string
  title: string | null
  isActive: boolean
  createdAt: string
}

interface TargetChannel {
  id: string
  username: string
  title: string | null
  isActive: boolean
}

interface ForwardingPair {
  id: string
  sourceChannel: SourceChannel
  targetChannel: TargetChannel
  isActive: boolean
}

export default function ChannelsPage() {
  const [sourceChannels, setSourceChannels] = useState<SourceChannel[]>([])
  const [targetChannels, setTargetChannels] = useState<TargetChannel[]>([])
  const [pairs, setPairs] = useState<ForwardingPair[]>([])
  const [loading, setLoading] = useState(true)
  const [newSource, setNewSource] = useState("")
  const [newTarget, setNewTarget] = useState("")
  const [selectedSource, setSelectedSource] = useState("")
  const [selectedTarget, setSelectedTarget] = useState("")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addTargetDialogOpen, setAddTargetDialogOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const { toast } = useToast()

  async function fetchChannels() {
    try {
      const res = await fetch("/api/channels")
      const data = await res.json()
      setSourceChannels(data.sourceChannels || [])
      setTargetChannels(data.targetChannels || [])
      setPairs(data.pairs || [])
    } catch {
      toast({ title: "Error", description: "Failed to load channels", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchChannels()
  }, [])

  async function addSourceChannel() {
    if (!newSource.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "source", username: newSource.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to add channel")
      }
      toast({ title: "Channel added", description: `${newSource} has been added` })
      setNewSource("")
      fetchChannels()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setAdding(false)
    }
  }

  async function deleteChannel(id: string, type: "source" | "target") {
    try {
      const res = await fetch(`/api/channels/${id}?type=${type}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      toast({ title: "Channel removed", description: "Channel has been deleted" })
      fetchChannels()
    } catch {
      toast({ title: "Error", description: "Failed to delete channel", variant: "destructive" })
    }
  }

  async function togglePair(pairId: string, isActive: boolean) {
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "togglePair", pairId, isActive }),
      })
      if (!res.ok) throw new Error()
      fetchChannels()
    } catch {
      toast({ title: "Error", description: "Failed to toggle pair", variant: "destructive" })
    }
  }

  async function addPair() {
    if (!selectedSource || !selectedTarget) return
    setAdding(true)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addPair",
          sourceChannelId: selectedSource,
          targetChannelId: selectedTarget,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create pair")
      }
      toast({ title: "Pair created", description: "Forwarding pair has been set up" })
      setSelectedSource("")
      setSelectedTarget("")
      setAddDialogOpen(false)
      fetchChannels()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setAdding(false)
    }
  }

  async function addTargetChannel() {
    if (!newTarget.trim()) return
    setAdding(true)
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "target", username: newTarget.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to add target channel")
      }
      toast({ title: "Target added", description: `${newTarget} has been added` })
      setNewTarget("")
      setAddTargetDialogOpen(false)
      fetchChannels()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channels</h1>
          <p className="text-muted-foreground mt-1">
            Manage your source and target channels
          </p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Forwarding Pair
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Forwarding Pair</DialogTitle>
              <DialogDescription>
                Select a source and target channel to create a forwarding pair.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Source Channel</Label>
                <Select value={selectedSource} onValueChange={setSelectedSource}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceChannels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.title || ch.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-center">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <Label>Target Channel</Label>
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select target..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetChannels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.title || ch.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addPair} disabled={!selectedSource || !selectedTarget || adding}>
                {adding && <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />}
                Create Pair
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Source Channels */}
        <Card className="border-0 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Source Channels</CardTitle>
                <CardDescription>
                  Channels to monitor and forward from
                </CardDescription>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Source Channel</DialogTitle>
                    <DialogDescription>
                      Enter the channel username (e.g., @channel) or numeric channel ID (e.g., 1406113886)
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Channel Username or ID</Label>
                      <Input
                        placeholder="@channel_name or 1406113886"
                        value={newSource}
                        onChange={(e) => setNewSource(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={addSourceChannel} disabled={!newSource.trim() || adding}>
                      {adding && <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />}
                      Add Channel
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {sourceChannels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No source channels added yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sourceChannels.map((ch) => (
                    <TableRow key={ch.id}>
                      <TableCell>
                        <div className="font-medium">{ch.title || ch.username}</div>
                        <div className="text-xs text-muted-foreground">{ch.username}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ch.isActive ? "success" : "secondary"}>
                          {ch.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              setSyncing(ch.id)
                              try {
                                const res = await fetch("/api/channels/sync", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ channelId: ch.id, type: "source" }),
                                })
                                if (!res.ok) throw new Error()
                                toast({ title: "Synced", description: "Chat ID resolved" })
                                fetchChannels()
                              } catch {
                                toast({ title: "Error", description: "Bot must be added as admin to this channel", variant: "destructive" })
                              } finally {
                                setSyncing(null)
                              }
                            }}
                            className="h-8 w-8"
                            title="Sync with Telegram"
                          >
                            <RefreshCw className={`h-4 w-4 ${syncing === ch.id ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteChannel(ch.id, "source")}
                            className="h-8 w-8 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Target Channels */}
        <Card className="border-0 shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Target Channels</CardTitle>
                <CardDescription>
                  Where messages will be forwarded to
                </CardDescription>
              </div>
              <Dialog open={addTargetDialogOpen} onOpenChange={setAddTargetDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Target Channel</DialogTitle>
                    <DialogDescription>
                      Enter the target channel username (e.g., @channel) or numeric channel ID
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Channel Username or ID</Label>
                      <Input
                        placeholder="@target_channel or 1234567890"
                        value={newTarget}
                        onChange={(e) => setNewTarget(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={addTargetChannel} disabled={!newTarget.trim() || adding}>
                      {adding && <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />}
                      Add Target
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {targetChannels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No target channels added yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targetChannels.map((ch) => (
                    <TableRow key={ch.id}>
                      <TableCell>
                        <div className="font-medium">{ch.title || ch.username}</div>
                        <div className="text-xs text-muted-foreground">{ch.username}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ch.isActive ? "success" : "secondary"}>
                          {ch.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              setSyncing(ch.id)
                              try {
                                const res = await fetch("/api/channels/sync", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ channelId: ch.id, type: "target" }),
                                })
                                if (!res.ok) throw new Error()
                                toast({ title: "Synced", description: "Chat ID resolved" })
                                fetchChannels()
                              } catch {
                                toast({ title: "Error", description: "Bot must be added as admin to this channel", variant: "destructive" })
                              } finally {
                                setSyncing(null)
                              }
                            }}
                            className="h-8 w-8"
                            title="Sync with Telegram"
                          >
                            <RefreshCw className={`h-4 w-4 ${syncing === ch.id ? "animate-spin" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteChannel(ch.id, "target")}
                            className="h-8 w-8 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Forwarding Pairs */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">Forwarding Pairs</CardTitle>
          <CardDescription>
            Active source → target channel mappings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pairs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ArrowRight className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No forwarding pairs configured</p>
              <p className="text-xs mt-1">
                Add source and target channels first, then create a pair
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Toggle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.map((pair) => (
                  <TableRow key={pair.id}>
                    <TableCell className="font-medium">
                      {pair.sourceChannel.title || pair.sourceChannel.username}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {pair.targetChannel.title || pair.targetChannel.username}
                    </TableCell>
                    <TableCell>
                      <Badge variant={pair.isActive ? "success" : "secondary"}>
                        {pair.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={pair.isActive}
                        onCheckedChange={(checked) => togglePair(pair.id, checked)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
