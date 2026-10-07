"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ChevronRight,
  ExternalLink,
  Github,
  Loader2,
  Plug,
  RefreshCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { requestJson } from "@/modules/nova-web/api"
import { NovaMark } from "@/modules/nova-web/components/timeline"
import type { ConnectorStatus } from "@/modules/nova-web/types"

type ComposioApp = {
  slug: string
  name: string
  description: string
  logo: string | null
  connected: boolean
  connectedAccountId: string | null
}

type ComposioTool = {
  name: string
  displayName: string
  description: string
  toolkit: string
  toolkitName: string
  requiresApproval: boolean
}

type DetailKey = string | null

const PROVIDER_BLURB: Record<string, string> = {
  github: "Repositories, pull requests, and your account",
  slack: "Start threads from Slack messages and reply in thread",
  linear: "Delegate issues to Nova from Linear",
}

function ProviderGlyph({ slug, logo }: { slug: string; logo?: string | null }) {
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" className="size-5 rounded object-contain" />
    )
  }
  if (slug === "github") return <Github className="size-4" />
  return (
    <span className="text-[11px] font-semibold uppercase text-[#a0a0a0]">
      {slug.slice(0, 1)}
    </span>
  )
}

export function ConnectionsView({
  connectors,
  loading,
  onRefreshConnectors,
}: {
  connectors: ConnectorStatus[]
  loading: boolean
  onRefreshConnectors?: () => void
}) {
  const [apps, setApps] = useState<ComposioApp[]>([])
  const [tools, setTools] = useState<ComposioTool[]>([])
  const [mcp, setMcp] = useState<{ url: string; sessionId: string } | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [appsLoading, setAppsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailKey>(null)

  const loadComposio = useCallback(async () => {
    setAppsLoading(true)
    setError(null)
    try {
      const [appsPayload, toolsPayload] = await Promise.all([
        requestJson<{
          apps: ComposioApp[]
          mcp: { url: string; sessionId: string; hasHeaders: boolean } | null
        }>("/api/nova/composio/apps"),
        requestJson<{ tools: ComposioTool[] }>("/api/nova/composio/tools").catch(() => ({
          tools: [] as ComposioTool[],
        })),
      ])
      setApps(appsPayload.apps)
      setMcp(
        appsPayload.mcp
          ? { url: appsPayload.mcp.url, sessionId: appsPayload.mcp.sessionId }
          : null,
      )
      setTools(toolsPayload.tools)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Composio apps")
    } finally {
      setAppsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadComposio()
  }, [loadComposio])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const integrationError = params.get("integration_error")
    if (integrationError) {
      setError(`Connection failed: ${integrationError.replaceAll("_", " ")}`)
    } else if (connected) {
      setError(null)
      void loadComposio()
      onRefreshConnectors?.()
    }
    if (connected || integrationError) {
      const url = new URL(window.location.href)
      url.searchParams.delete("connected")
      url.searchParams.delete("integration_error")
      window.history.replaceState({}, "", `${url.pathname}${url.search}`)
    }
  }, [loadComposio, onRefreshConnectors])

  async function connectApp(slug: string) {
    setBusySlug(slug)
    setError(null)
    try {
      const result = await requestJson<{ redirectUrl?: string | null; connectedAccountId?: string; error?: string }>(
        "/api/nova/composio/connect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        },
      )
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl
        return
      }
      if (result.connectedAccountId && !result.error) {
        await loadComposio()
        setBusySlug(null)
        return
      }
      throw new Error(result.error || "The CLI server did not return a Composio connection")
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Connect failed")
      setBusySlug(null)
    }
  }

  async function disconnectApp(app: ComposioApp) {
    if (!app.connectedAccountId) return
    setBusySlug(app.slug)
    setError(null)
    try {
      await requestJson("/api/nova/composio/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectedAccountId: app.connectedAccountId }),
      })
      await loadComposio()
      onRefreshConnectors?.()
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Disconnect failed")
    } finally {
      setBusySlug(null)
    }
  }

  const selectedApp = apps.find((app) => app.slug === detail) ?? null
  const selectedConnector = connectors.find((item) => item.provider === detail) ?? null
  const selectedTools = tools.filter((tool) => tool.toolkit === detail)

  // Detail pane for one integration
  if (selectedApp || selectedConnector) {
    const title = selectedApp?.name ?? selectedConnector?.provider ?? "Integration"
    const description =
      selectedApp?.description
      || PROVIDER_BLURB[selectedConnector?.provider ?? ""]
      || selectedConnector?.statusMessage
      || ""
    const connected = selectedApp
      ? selectedApp.connected
      : Boolean(selectedConnector?.ready)
    const logo = selectedApp?.logo

    return (
      <div className="h-full overflow-y-auto bg-[#0f0f0f]">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="mb-6 text-[12px] text-[#6b6b6b] transition hover:text-[#a0a0a0]"
          >
            ← Integrations
          </button>

          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[#161616]">
              <ProviderGlyph slug={detail ?? ""} logo={logo} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[18px] font-medium capitalize text-[#e8e8e8]">{title}</h1>
              <p className="mt-1 text-[13px] leading-5 text-[#6b6b6b]">{description}</p>
            </div>
            {selectedApp ? (
              connected ? (
                <button
                  type="button"
                  disabled={busySlug === selectedApp.slug}
                  onClick={() => void disconnectApp(selectedApp)}
                  className="h-9 rounded-lg border border-white/[0.1] px-3 text-[12px] text-[#a0a0a0] transition hover:bg-white/[0.04] disabled:opacity-50"
                >
                  {busySlug === selectedApp.slug ? "Working…" : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busySlug === selectedApp.slug}
                  onClick={() => void connectApp(selectedApp.slug)}
                  className="h-9 rounded-lg bg-[#2dd4bf] px-3 text-[12px] font-medium text-[#0a0a0a] transition hover:bg-[#5eead4] disabled:opacity-50"
                >
                  {busySlug === selectedApp.slug ? "Opening…" : `Connect ${selectedApp.name}`}
                </button>
              )
            ) : selectedConnector?.authorizeUrl ? (
              <a
                href={selectedConnector.authorizeUrl}
                className="inline-flex h-9 items-center rounded-lg bg-[#2dd4bf] px-3 text-[12px] font-medium text-[#0a0a0a] transition hover:bg-[#5eead4]"
              >
                {selectedConnector.botInstallation ? "Reconnect" : "Connect"}
              </a>
            ) : null}
          </div>

          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#141414] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                  Docs
                </p>
                <a
                  href="https://docs.composio.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-[#c8c8c8] hover:text-white"
                >
                  <ExternalLink className="size-3.5" />
                  {title} + Composio MCP guide
                </a>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px]",
                  connected
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-white/[0.05] text-[#8a8a8a]",
                )}
              >
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-4">
                <p className="text-[12px] font-medium text-[#e4e4e4]">Overview</p>
                <p className="mt-2 text-[12px] leading-5 text-[#6b6b6b]">
                  Same Composio toolkit path as Nova desktop and supercode-cli. Connect once;
                  tools and MCP session become available to the harness.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-4">
                <p className="text-[12px] font-medium text-[#e4e4e4]">MCP session</p>
                <p className="mt-2 break-all font-mono text-[10px] leading-4 text-[#5c5c5c]">
                  {mcp?.url ?? "Connect an app to mint an MCP session URL."}
                </p>
                {mcp?.sessionId ? (
                  <p className="mt-2 font-mono text-[10px] text-[#3d3d3d]">
                    session {mcp.sessionId}
                  </p>
                ) : null}
              </div>
            </div>

            {selectedTools.length > 0 ? (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                  Tools ({selectedTools.length})
                </p>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {selectedTools.slice(0, 40).map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2"
                    >
                      <p className="font-mono text-[11px] text-[#c8c8c8]">{tool.name}</p>
                      <p className="mt-0.5 text-[11px] text-[#5c5c5c]">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedConnector?.statusMessage ? (
              <p className="mt-5 text-[12px] leading-5 text-[#6b6b6b]">
                Bot surface: {selectedConnector.statusMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0f0f0f]">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <div className="flex items-center gap-3">
          <NovaMark />
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-medium text-[#e8e8e8]">Connections</h1>
            <p className="text-[12px] text-[#6b6b6b]">
              Your Supercode CLI apps and Composio MCP tools, shared with Nova desktop
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadComposio()
              onRefreshConnectors?.()
            }}
            className="flex size-8 items-center justify-center rounded-lg text-[#6b6b6b] transition hover:bg-white/[0.04] hover:text-[#a0a0a0]"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("size-3.5", (appsLoading || loading) && "animate-spin")} />
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-8 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414]">
          {appsLoading && apps.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-[12px] text-[#6b6b6b]">
              <Loader2 className="size-3.5 animate-spin" />
              Loading Composio apps…
            </div>
          ) : apps.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Plug className="mx-auto size-5 text-[#3d3d3d]" />
              <p className="mt-3 text-[13px] text-[#c8c8c8]">No Composio toolkits available</p>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">
                Configure Composio toolkits on the supercode-cli server used by Nova desktop.
              </p>
            </div>
          ) : (
            apps.map((app, index) => (
              <button
                key={app.slug}
                type="button"
                onClick={() => setDetail(app.slug)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]",
                  index > 0 && "border-t border-white/[0.06]",
                )}
              >
                <div className="flex size-9 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1a1a1a]">
                  <ProviderGlyph slug={app.slug} logo={app.logo} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[#e4e4e4]">{app.name}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[#6b6b6b]">
                    {PROVIDER_BLURB[app.slug] || app.description || "Composio toolkit"}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px]",
                    app.connected
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-white/[0.05] text-[#8a8a8a]",
                  )}
                >
                  {app.connected ? "Connected" : "Not connected"}
                </span>
                <ChevronRight className="size-4 text-[#3d3d3d]" />
              </button>
            ))
          )}
        </div>

        {connectors.length > 0 ? (
          <div className="mt-8">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
              Nova bot surfaces
            </p>
            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141414]">
              {connectors.map((connector, index) => (
                <button
                  key={connector.provider}
                  type="button"
                  onClick={() => setDetail(connector.provider)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/[0.03]",
                    index > 0 && "border-t border-white/[0.06]",
                  )}
                >
                  <div className="flex size-9 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1a1a1a] text-[11px] font-semibold uppercase text-[#a0a0a0]">
                    {connector.provider.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium capitalize text-[#e4e4e4]">
                      {connector.provider} bot
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[#6b6b6b]">
                      {connector.statusMessage || PROVIDER_BLURB[connector.provider] || "Nova conversation surface"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px]",
                      connector.ready
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-white/[0.05] text-[#8a8a8a]",
                    )}
                  >
                    {connector.ready ? "Ready" : "Action needed"}
                  </span>
                  <ChevronRight className="size-4 text-[#3d3d3d]" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-[11px] leading-5 text-[#4a4a4a]">
          Nova web, desktop, and CLI use the supercode-cli server’s{" "}
          <span className="font-mono">/api/composio/*</span> endpoints. Connections and MCP
          tools belong to your Supercode CLI account, separate from Supercode Review integrations.
        </p>
      </div>
    </div>
  )
}
