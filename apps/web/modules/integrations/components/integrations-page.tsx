"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  disconnectIntegration,
  getIntegrationStatuses,
  listLinearTeams,
  updateLinearTeam,
  updateSlackChannel,
  type LinearTeamOption,
} from "@/modules/integrations/actions"
import type {
  IntegrationProvider,
  IntegrationStatus,
} from "@/modules/integrations/actions/schema"
import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  PlugZap,
  Search,
  Unlink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type AppDef = {
  id: IntegrationProvider
  name: string
  category: string
  description: string
  connectHref: string
  docsHref?: string
  features: string[]
  accent: string
  logo: ReactNode
}

function SlackLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5.04 15.16a2.04 2.04 0 1 1-2.04-2.04h2.04v2.04Zm1.02 0a2.04 2.04 0 1 1 4.08 0v5.1a2.04 2.04 0 1 1-4.08 0v-5.1Z"
      />
      <path
        fill="currentColor"
        d="M8.88 5.04a2.04 2.04 0 1 1 2.04-2.04v2.04H8.88Zm0 1.02a2.04 2.04 0 1 1 0 4.08h-5.1a2.04 2.04 0 1 1 0-4.08h5.1Z"
      />
      <path
        fill="currentColor"
        d="M18.96 8.88a2.04 2.04 0 1 1 2.04 2.04h-2.04V8.88Zm-1.02 0a2.04 2.04 0 1 1-4.08 0v-5.1a2.04 2.04 0 1 1 4.08 0v5.1Z"
      />
      <path
        fill="currentColor"
        d="M15.12 18.96a2.04 2.04 0 1 1-2.04 2.04v-2.04h2.04Zm0-1.02a2.04 2.04 0 1 1 0-4.08h5.1a2.04 2.04 0 1 1 0 4.08h-5.1Z"
      />
    </svg>
  )
}

function LinearLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M2.86 12.86 12.86 2.86A8.57 8.57 0 0 0 2.86 12.86Zm1.9 4.66 12.04-12.04a8.57 8.57 0 0 0-12.04 12.04Zm3.14 2.62 12.66-12.66a8.57 8.57 0 0 1-12.66 12.66Zm9.48-.76A8.57 8.57 0 0 1 5.62 5.62L17.38 17.38Z"
      />
    </svg>
  )
}

const APPS: AppDef[] = [
  {
    id: "slack",
    name: "Slack",
    category: "Messaging",
    description:
      "Post PR review summaries to a channel and optionally DM authors when a review completes.",
    connectHref: "/api/integrations/slack",
    docsHref: "https://api.slack.com/apps",
    features: [
      "Channel notifications",
      "Author DMs (coming soon)",
      "Thread replies for agent chat",
    ],
    accent: "bg-[#4A154B]/15 text-[#E01E5A] border-[#E01E5A]/20",
    logo: <SlackLogo className="h-6 w-6" />,
  },
  {
    id: "linear",
    name: "Linear",
    category: "Issue tracking",
    description:
      "Comment on linked Linear issues or open a review issue when no ticket is referenced.",
    connectHref: "/api/integrations/linear",
    docsHref: "https://linear.app/settings/api",
    features: [
      "Issue comments from reviews",
      "Create issue fallback",
      "Team-scoped workspace",
    ],
    accent: "bg-foreground/10 text-foreground border-border",
    logo: <LinearLogo className="h-6 w-6" />,
  },
]

type IntegrationStatusesData = NonNullable<
  Awaited<ReturnType<typeof getIntegrationStatuses>>
>

function statusFor(
  data: IntegrationStatusesData | null | undefined,
  id: IntegrationProvider,
): IntegrationStatus | undefined {
  if (!data) return undefined
  return id === "slack" ? data.slack : data.linear
}

export function IntegrationsPage() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [channelDraft, setChannelDraft] = useState("")
  const [linearDialogOpen, setLinearDialogOpen] = useState(false)
  const [linearTeams, setLinearTeams] = useState<LinearTeamOption[]>([])
  const [linearTeamDraft, setLinearTeamDraft] = useState("")
  const [linearTeamsLoading, setLinearTeamsLoading] = useState(false)
  const [linearTeamsError, setLinearTeamsError] = useState<string | null>(null)
  const [promptLinearTeamAfterConnect, setPromptLinearTeamAfterConnect] =
    useState(false)

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["integration-statuses"],
    queryFn: async () => await getIntegrationStatuses(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  })

  const openLinearTeamDialog = async (opts?: { preferredTeamId?: string | null }) => {
    setLinearDialogOpen(true)
    setLinearTeamsLoading(true)
    setLinearTeamsError(null)
    try {
      const result = await listLinearTeams()
      if (!result.success) {
        setLinearTeams([])
        setLinearTeamsError(result.error || "Failed to load Linear teams")
        return
      }
      setLinearTeams(result.teams)
      const preferred =
        opts?.preferredTeamId ||
        result.selectedTeamId ||
        result.teams[0]?.id ||
        ""
      setLinearTeamDraft(preferred)
    } catch {
      setLinearTeams([])
      setLinearTeamsError("Failed to load Linear teams")
    } finally {
      setLinearTeamsLoading(false)
    }
  }

  useEffect(() => {
    const connected = searchParams.get("connected")
    const error = searchParams.get("integration_error")
    if (connected === "slack" || connected === "linear") {
      toast.success(
        connected === "slack"
          ? "Slack connected via Composio"
          : "Linear connected via Composio — choose a workspace",
      )
      queryClient.invalidateQueries({ queryKey: ["integration-statuses"] })
      if (connected === "linear") {
        setPromptLinearTeamAfterConnect(true)
      }
      const url = new URL(window.location.href)
      url.searchParams.delete("connected")
      url.searchParams.delete("integration_error")
      window.history.replaceState({}, "", url.pathname + url.search)
    } else if (error) {
      toast.error(`Integration error: ${error.replaceAll("_", " ")}`)
      const url = new URL(window.location.href)
      url.searchParams.delete("integration_error")
      url.searchParams.delete("connected")
      window.history.replaceState({}, "", url.pathname + url.search)
    }
  }, [searchParams, queryClient])

  // After Linear OAuth, open workspace picker once statuses are fresh.
  useEffect(() => {
    if (!promptLinearTeamAfterConnect || isLoading || !data?.linear?.connected) {
      return
    }
    setPromptLinearTeamAfterConnect(false)
    void openLinearTeamDialog({ preferredTeamId: data.linear.teamId })
  }, [promptLinearTeamAfterConnect, isLoading, data])

  const disconnectMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) =>
      disconnectIntegration(provider),
    onSuccess: (result, provider) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["integration-statuses"] })
        toast.success(
          provider === "slack" ? "Slack disconnected" : "Linear disconnected",
        )
      } else {
        toast.error(result?.error || "Failed to disconnect")
      }
    },
    onError: () => toast.error("Failed to disconnect integration"),
  })

  const channelMutation = useMutation({
    mutationFn: async (channelId: string | null) => updateSlackChannel(channelId),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["integration-statuses"] })
        toast.success("Slack notification channel updated")
        setChannelDialogOpen(false)
      } else {
        toast.error(result?.error || "Failed to update channel")
      }
    },
    onError: () => toast.error("Failed to update channel"),
  })

  const linearTeamMutation = useMutation({
    mutationFn: async (payload: { teamId: string; teamName: string | null }) =>
      updateLinearTeam(payload.teamId, payload.teamName),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["integration-statuses"] })
        toast.success("Linear workspace saved — reviews will use supercodeAI here")
        setLinearDialogOpen(false)
      } else {
        toast.error(result?.error || "Failed to save Linear workspace")
      }
    },
    onError: () => toast.error("Failed to save Linear workspace"),
  })

  const composioConfigured = data?.composioConfigured ?? false

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return APPS
    return APPS.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q) ||
        app.description.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const connectedCount = APPS.filter((app) =>
    Boolean(statusFor(data, app.id)?.connected),
  ).length

  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-10 flex flex-col gap-2"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20">
              <Blocks className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-foreground">
                Integrations
              </h1>
              <p className="text-xs text-muted-foreground/60">
                Connect Slack and Linear through Composio for PR review
                notifications
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-lg text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <div className="rounded-xl border border-border bg-muted/10 px-5 py-4">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Available apps
          </p>
          <p className="mt-2 text-2xl font-medium text-foreground">{APPS.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/10 px-5 py-4">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Connected
          </p>
          <p className="mt-2 text-2xl font-medium text-foreground">
            {isLoading ? "—" : connectedCount}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/10 px-5 py-4">
          <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Auth provider
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            Composio{" "}
            <span
              className={cn(
                "ml-2 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                composioConfigured
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              {composioConfigured ? "Configured" : "Missing API key"}
            </span>
          </p>
        </div>
      </motion.div>

      {!composioConfigured && !isLoading ? (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Set <code className="font-mono">COMPOSIO_API_KEY</code> on the server to
          enable Connect. Optional:{" "}
          <code className="font-mono">COMPOSIO_SLACK_AUTH_CONFIG_ID</code>,{" "}
          <code className="font-mono">COMPOSIO_LINEAR_AUTH_CONFIG_ID</code>.
        </div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        className="flex-1"
      >
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
            Apps ({filteredApps.length})
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full sm:w-64 rounded-lg border border-border bg-muted/20 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-xl border border-border bg-muted/20"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredApps.map((app, index) => {
              const status = statusFor(data, app.id)
              const connected = Boolean(status?.connected)
              const disconnecting =
                disconnectMutation.isPending &&
                disconnectMutation.variables === app.id

              return (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.06 }}
                  className="group flex flex-col rounded-xl border border-border bg-card/40 p-5 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
                          app.accent,
                        )}
                      >
                        {app.logo}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-medium text-foreground">
                            {app.name}
                          </h3>
                          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {app.category}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">
                          {app.description}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium",
                        connected
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border bg-muted/20 text-muted-foreground",
                      )}
                    >
                      {connected ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Connected
                        </>
                      ) : (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                          Not connected
                        </>
                      )}
                    </div>
                  </div>

{connected ? (
                    <div className="mt-4 rounded-lg border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                      {status?.teamName ? (
                        <p>
                          Workspace:{" "}
                          <span className="text-foreground">{status.teamName}</span>
                        </p>
                      ) : app.id === "linear" ? (
                        <p className="text-amber-700 dark:text-amber-300">
                          Connected — choose a Linear workspace so reviews create
                          the shared <span className="font-medium">supercodeAI</span>{" "}
                          project.
                        </p>
                      ) : (
                        <p>Connected account active via Composio</p>
                      )}
                      {app.id === "slack" && status?.channelId ? (
                        <p className="mt-1">
                          Channel:{" "}
                          <span className="font-mono text-[11px] text-foreground">
                            {status.channelId}
                          </span>
                        </p>
                      ) : null}
                      {status?.updatedAt ? (
                        <p className="mt-1 text-[10px] text-muted-foreground/50">
                          Updated {new Date(status.updatedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <ul className="mt-4 space-y-1.5">
                    {app.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-[11px] text-muted-foreground/70"
                      >
                        <MessageSquare className="h-3 w-3 text-muted-foreground/40" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
{connected ? (
                      <>
                        {app.id === "slack" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs"
                            onClick={() => {
                              setChannelDraft(status?.channelId || "")
                              setChannelDialogOpen(true)
                            }}
                          >
                            Configure channel
                          </Button>
                        ) : null}
                        {app.id === "linear" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-xs"
                            onClick={() =>
                              void openLinearTeamDialog({
                                preferredTeamId: status?.teamId,
                              })
                            }
                          >
                            {status?.teamId ? "Change workspace" : "Choose workspace"}
                          </Button>
                        ) : null}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs text-destructive hover:text-destructive"
                          disabled={disconnecting}
                          onClick={() => disconnectMutation.mutate(app.id)}
                        >
                          {disconnecting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Unlink className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 rounded-lg text-xs"
                        disabled={!composioConfigured}
                        asChild={composioConfigured}
                      >
                        {composioConfigured ? (
                          <a href={app.connectHref}>
                            <Link2 className="mr-1.5 h-3.5 w-3.5" />
                            Connect {app.name}
                          </a>
                        ) : (
                          <span>
                            <Link2 className="mr-1.5 h-3.5 w-3.5 inline" />
                            Connect {app.name}
                          </span>
                        )}
                      </Button>
                    )}

                    {app.docsHref ? (
                      <a
                        href={app.docsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
                      >
                        Docs
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {!isLoading && filteredApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-border rounded-xl">
            <span className="text-sm font-medium text-foreground mb-1">
              No integrations match
            </span>
            <span className="text-xs text-muted-foreground/40">
              Try a different search term
            </span>
          </div>
        ) : null}
      </motion.div>

<Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Slack notification channel</DialogTitle>
            <DialogDescription>
              Channel ID where PR review summaries are posted (e.g.{" "}
              <code className="text-xs">C0123456789</code>). Leave blank to clear.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="slack-channel">Channel ID</Label>
            <Input
              id="slack-channel"
              value={channelDraft}
              onChange={(e) => setChannelDraft(e.target.value)}
              placeholder="C0123456789"
              className="rounded-lg font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="rounded-lg"
              onClick={() => setChannelDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-lg"
              disabled={channelMutation.isPending}
              onClick={() =>
                channelMutation.mutate(channelDraft.trim() || null)
              }
            >
              {channelMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linearDialogOpen} onOpenChange={setLinearDialogOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Linear workspace</DialogTitle>
            <DialogDescription>
              Choose the Linear team where Supercode creates the shared{" "}
              <span className="font-medium text-foreground">supercodeAI</span>{" "}
              project and posts PR review issues.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="linear-team">Team / workspace</Label>
            {linearTeamsLoading ? (
              <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading teams…
              </div>
            ) : linearTeamsError ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {linearTeamsError}
              </div>
            ) : linearTeams.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                No Linear teams found for this account.
              </div>
            ) : (
              <select
                id="linear-team"
                value={linearTeamDraft}
                onChange={(e) => setLinearTeamDraft(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
              >
                {linearTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name || team.id}
                  </option>
                ))}
              </select>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="rounded-lg"
              onClick={() => setLinearDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-lg"
              disabled={
                linearTeamMutation.isPending ||
                linearTeamsLoading ||
                !linearTeamDraft.trim() ||
                Boolean(linearTeamsError)
              }
              onClick={() => {
                const team =
                  linearTeams.find((t) => t.id === linearTeamDraft) || null
                if (!team) return
                linearTeamMutation.mutate({
                  teamId: team.id,
                  teamName: team.name,
                })
              }}
            >
              {linearTeamMutation.isPending ? "Saving..." : "Save workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
