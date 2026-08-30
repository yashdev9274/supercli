"use client"

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  disconnectIntegration,
  getIntegrationStatuses,
} from "@/modules/integrations/actions"
import type { IntegrationProvider, IntegrationStatus } from "@/modules/integrations/actions/schema"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Link2, Unlink } from "lucide-react"

function ProviderRow({
  title,
  description,
  status,
  connectHref,
  onDisconnect,
  disconnecting,
  connectDisabled,
}: {
  title: string
  description: string
  status: IntegrationStatus | undefined
  connectHref: string
  onDisconnect: () => void
  disconnecting: boolean
  connectDisabled?: boolean
}) {
  const connected = Boolean(status?.connected)

  return (
    <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{title}</h3>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {connected && status?.teamName ? (
          <p className="text-sm text-muted-foreground">
            Workspace: <span className="text-foreground">{status.teamName}</span>
            {status.channelId ? (
              <>
                {" "}
                · Channel ID:{" "}
                <span className="font-mono text-xs">{status.channelId}</span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        {connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            disabled={disconnecting}
            className="text-destructive hover:text-destructive"
          >
            <Unlink className="h-4 w-4 mr-2" />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : (
          <Button asChild size="sm" disabled={connectDisabled}>
            <a
              href={connectDisabled ? undefined : connectHref}
              aria-disabled={connectDisabled}
              onClick={(e) => {
                if (connectDisabled) e.preventDefault()
              }}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Connect
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

export function IntegrationsSettings() {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  const { data, isLoading } = useQuery({
    queryKey: ["integration-statuses"],
    queryFn: async () => await getIntegrationStatuses(),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    const connected = searchParams.get("connected")
    const error = searchParams.get("integration_error")
    if (connected === "slack" || connected === "linear") {
      toast.success(
        connected === "slack"
          ? "Slack workspace connected via Composio"
          : "Linear workspace connected via Composio",
      )
      queryClient.invalidateQueries({ queryKey: ["integration-statuses"] })
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

  const disconnectMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) => {
      return await disconnectIntegration(provider)
    },
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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Connect Slack and Linear for PR review notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const composioConfigured = data?.composioConfigured ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>
          Connect Slack and Linear through Composio so Supercode can notify your team
          when PR reviews complete. Connections are stored per organization; OAuth
          tokens are managed by Composio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!composioConfigured ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Composio is not configured. Set <code className="text-xs">COMPOSIO_API_KEY</code>{" "}
            on the server to enable Connect.
          </p>
        ) : null}
        <ProviderRow
          title="Slack"
          description="Post review summaries to a channel and DM PR authors (via Composio)."
          status={data?.slack}
          connectHref="/api/integrations/slack"
          onDisconnect={() => disconnectMutation.mutate("slack")}
          disconnecting={
            disconnectMutation.isPending && disconnectMutation.variables === "slack"
          }
          connectDisabled={!composioConfigured}
        />
        <ProviderRow
          title="Linear"
          description="Comment on linked issues or create review issues in Linear (via Composio)."
          status={data?.linear}
          connectHref="/api/integrations/linear"
          onDisconnect={() => disconnectMutation.mutate("linear")}
          disconnecting={
            disconnectMutation.isPending && disconnectMutation.variables === "linear"
          }
          connectDisabled={!composioConfigured}
        />
      </CardContent>
    </Card>
  )
}
