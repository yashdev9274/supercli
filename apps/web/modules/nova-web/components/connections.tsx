"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronRight,
  ExternalLink,
  Github,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { requestJson } from "@/modules/nova-web/api"
import type { ConnectorStatus } from "@/modules/nova-web/types"

type ComposioCategory = {
  slug: string
  name: string
}

type ComposioApp = {
  slug: string
  name: string
  description: string
  logo: string | null
  categories: ComposioCategory[]
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

const CATEGORY_ORDER = [
  "monitoring",
  "observability",
  "deployment",
  "devops",
  "database",
  "databases",
  "developer-tools",
  "development",
  "project-management",
  "communication",
  "productivity",
  "design",
  "marketing",
  "finance",
  "security",
]

function categoryRank(slug: string): number {
  const index = CATEGORY_ORDER.indexOf(slug.toLowerCase())
  return index === -1 ? CATEGORY_ORDER.length : index
}

function ProviderGlyph({ slug, logo }: { slug: string; logo?: string | null }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  if (logo && logo !== failedLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" onError={() => setFailedLogo(logo)} className={cn("size-5 rounded object-contain", (slug === "github" || slug === "vercel") && "brightness-0 invert")} />
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
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | "connected">("all")

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
        onRefreshConnectors?.()
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
  const selectedConnector = connectors.find((item) => `bot:${item.provider}` === detail) ?? null
  const selectedTools = tools.filter((tool) => tool.toolkit === detail)
  const searchTerm = query.trim().toLowerCase()
  const matchesSearch = (...values: string[]) => values.join(" ").toLowerCase().includes(searchTerm)
  const visibleConnectors = connectors.filter((connector) => (
    (status === "all" || connector.ready)
    && matchesSearch(connector.provider, "bot", "Nova bot surfaces", connector.statusMessage ?? "", PROVIDER_BLURB[connector.provider] ?? "")
  ))
  const connectedCount = apps.filter((app) => app.connected).length
    + connectors.filter((connector) => connector.ready).length
  const groupedApps = useMemo(() => {
    const groups = new Map<string, { category: ComposioCategory; apps: ComposioApp[] }>()

    for (const app of apps) {
      if (status === "connected" && !app.connected) continue
      const categories = app.categories.length > 0
        ? app.categories
        : [{ slug: "other", name: "Other" }]
      if (![app.name, app.slug, app.description, PROVIDER_BLURB[app.slug] ?? "", ...categories.flatMap((category) => [category.name, category.slug])]
        .join(" ").toLowerCase().includes(searchTerm)) continue
      const category = [...categories].sort((a, b) => categoryRank(a.slug) - categoryRank(b.slug))[0]
        ?? { slug: "other", name: "Other" }
      const group = groups.get(category.slug)
      if (group) group.apps.push(app)
      else groups.set(category.slug, { category, apps: [app] })
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        apps: [...group.apps].sort((a, b) => a.connected === b.connected
          ? a.name.localeCompare(b.name)
          : a.connected ? -1 : 1),
      }))
      .sort((a, b) => categoryRank(a.category.slug) - categoryRank(b.category.slug)
        || a.category.name.localeCompare(b.category.name))
  }, [apps, searchTerm, status])

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
      <div className="h-full overflow-y-auto bg-[#0e0e10]">
        <div className="mx-auto max-w-[840px] px-5 py-10 sm:px-10 sm:py-14">
          <button
            type="button"
            onClick={() => setDetail(null)}
            className="mb-6 text-[12px] text-[#85858e] transition hover:text-[#a0a0a0]"
          >
            ← Connections
          </button>

          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] bg-[#151517]">
              <ProviderGlyph slug={selectedApp?.slug ?? selectedConnector?.provider ?? ""} logo={logo} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-medium tracking-[-0.025em] capitalize text-[#e8e8e8]">{title}</h1>
              <p className="mt-1 text-[13px] leading-5 text-[#85858e]">{description}</p>
            </div>
            {selectedApp ? (
              connected ? (
                <button
                  type="button"
                  aria-label={`Disconnect ${selectedApp.name}`}
                  disabled={busySlug === selectedApp.slug}
                  onClick={() => void disconnectApp(selectedApp)}
                  className="h-9 rounded-lg border border-white/[0.08] px-3 text-[12px] text-[#a0a0a0] transition hover:bg-white/[0.04] disabled:opacity-50"
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
                aria-label={`${selectedConnector.botInstallation ? "Reconnect" : "Connect"} ${selectedConnector.provider} bot`}
                className="inline-flex h-9 items-center rounded-lg bg-[#2dd4bf] px-3 text-[12px] font-medium text-[#0a0a0a] transition hover:bg-[#5eead4]"
              >
                {selectedConnector.botInstallation ? "Reconnect" : "Connect"}
              </a>
            ) : null}
          </div>

          {error ? <p role="alert" className="mt-5 text-[13px] text-red-300">{error}</p> : null}

          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#151517] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#7c7c85]">
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
              <div className="rounded-xl border border-white/[0.06] bg-[#151517] p-4">
                <p className="text-[12px] font-medium text-[#e4e4e4]">Overview</p>
                <p className="mt-2 text-[12px] leading-5 text-[#85858e]">
                  Same Composio toolkit path as Nova desktop and supercode-cli. Connect once;
                  tools and MCP session become available to the harness.
                </p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-[#151517] p-4">
                <p className="text-[12px] font-medium text-[#e4e4e4]">MCP session</p>
                <p className="mt-2 break-all font-mono text-[10px] leading-4 text-[#7c7c85]">
                  {mcp?.url ?? "Connect an app to mint an MCP session URL."}
                </p>
                {mcp?.sessionId ? (
                  <p className="mt-2 font-mono text-[10px] text-[#71717a]">
                    session {mcp.sessionId}
                  </p>
                ) : null}
              </div>
            </div>

            {selectedTools.length > 0 ? (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#7c7c85]">
                  Tools ({selectedTools.length})
                </p>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {selectedTools.slice(0, 40).map((tool) => (
                    <div
                      key={tool.name}
                      className="rounded-lg border border-white/[0.04] bg-[#151517] px-3 py-2"
                    >
                      <p className="font-mono text-[11px] text-[#c8c8c8]">{tool.name}</p>
                      <p className="mt-0.5 text-[11px] text-[#7c7c85]">{tool.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedConnector?.statusMessage ? (
              <p className="mt-5 text-[12px] leading-5 text-[#85858e]">
                Bot surface: {selectedConnector.statusMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0e0e10]">
      <div className="mx-auto w-full max-w-[930px] px-5 py-10 sm:px-10 sm:py-14">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-medium tracking-[-0.035em] text-[#e8e8e8]">Connections</h1>
            <p className="mt-2 text-[13px] leading-5 text-[#85858e]">
              Bring your tools together. Connect your apps to give Nova more context.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadComposio()
              onRefreshConnectors?.()
            }}
            className="flex size-8 items-center justify-center rounded-lg text-[#85858e] transition hover:bg-white/[0.04] hover:text-[#a0a0a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            aria-label="Refresh connections"
            disabled={appsLoading || loading}
          >
            <RefreshCw className={cn("size-3.5", (appsLoading || loading) && "animate-spin")} />
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-300">
            {error}
          </p>
        ) : null}

        <div className="relative mt-7">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#71717a]" />
          <input
            type="search"
            aria-label="Search connections"
            placeholder="Search connections…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.09] bg-[#151517] pl-10 pr-10 text-[13px] text-[#e4e4e4] outline-none placeholder:text-[#71717a] focus:border-white/25 focus:ring-2 focus:ring-white/10 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button type="button" aria-label="Clear connection search" onClick={() => setQuery("")} className="absolute right-2 top-2 rounded-md p-1.5 text-[#85858e] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex gap-1 border-b border-white/[0.07] pb-4" aria-label="Connection status filters">
          {(["all", "connected"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={status === filter}
              onClick={() => setStatus(filter)}
              className={cn("rounded-lg px-3 py-1.5 text-[12px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60", status === filter ? "bg-white/[0.07] text-[#e4e4e4]" : "text-[#85858e] hover:bg-white/[0.03] hover:text-[#c8c8c8]")}
            >
              {filter === "all" ? "All connections" : "Connected"}
              <span className="ml-2 text-[#85858e]">{filter === "all" ? apps.length + connectors.length : connectedCount}</span>
            </button>
          ))}
        </div>

        <div className="mt-7 space-y-8" aria-busy={appsLoading}>
          {appsLoading && apps.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-12 text-[12px] text-[#85858e]">
              <Loader2 className="size-3.5 animate-spin" />
              Loading Composio apps…
            </div>
          ) : apps.length === 0 && visibleConnectors.length === 0 && !searchTerm && status === "all" ? (
            <div className="px-5 py-10 text-center">
              <Plug className="mx-auto size-5 text-[#71717a]" />
              <p className="mt-3 text-[13px] text-[#c8c8c8]">No Composio toolkits available</p>
              <p className="mt-1 text-[12px] text-[#85858e]">
                Configure Composio toolkits on the supercode-cli server used by Nova desktop.
              </p>
            </div>
          ) : (
            groupedApps.map((group) => (
              <section key={group.category.slug} aria-labelledby={`connection-category-${group.category.slug}`}>
                <div className="mb-3 flex items-center gap-2">
                  <h2
                    id={`connection-category-${group.category.slug}`}
                    className="text-[13px] font-medium text-[#c8c8c8]"
                  >
                    {group.category.name}
                  </h2>
                  <span className="text-[11px] text-[#71717a]">{group.apps.length}</span>
                </div>
                <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {group.apps.map((app) => (
                  <div
                    key={app.slug}
                    className="group flex min-w-0 items-center gap-2 rounded-xl py-3 pl-1 pr-2 transition hover:bg-white/[0.025]"
                  >
                    <button type="button" aria-label={`View ${app.name} details`} onClick={() => setDetail(app.slug)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1a1a1d]">
                      <ProviderGlyph slug={app.slug} logo={app.logo} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#e4e4e4]">{app.name}{app.connected ? <Check aria-label="Connected" className="size-3.5 shrink-0 text-emerald-400" /> : null}</p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-[#85858e]">
                        {PROVIDER_BLURB[app.slug] || app.description || "Composio toolkit"}
                      </p>
                    </div>
                    </button>
                    <button
                      type="button"
                      aria-label={app.connected ? `Manage ${app.name} connection` : `Connect ${app.name}`}
                      disabled={busySlug !== null}
                      onClick={() => app.connected ? setDetail(app.slug) : void connectApp(app.slug)}
                      className="flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[11px] text-[#a0a0a0] transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:opacity-50"
                    >
                      {busySlug === app.slug ? <Loader2 className="size-4 animate-spin" /> : app.connected ? <>Manage<ChevronRight className="size-3" /></> : <Plus className="size-4" />}
                    </button>
                  </div>
                ))}
                </div>
              </section>
            ))
          )}
        </div>

        {!appsLoading && groupedApps.length === 0 && visibleConnectors.length === 0 && (apps.length > 0 || connectors.length > 0 || Boolean(searchTerm) || status === "connected") ? (
          <div role="status" className="py-12 text-center">
            <p className="text-[13px] text-[#c8c8c8]">{searchTerm ? "No connections match your search" : "No connected apps yet"}</p>
            <button type="button" onClick={() => { setQuery(""); setStatus("all") }} className="mt-3 rounded-sm text-[12px] text-[#a0a0a0] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">Show all connections</button>
          </div>
        ) : null}

        {visibleConnectors.length > 0 ? (
          <div className="mt-8">
            <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#7c7c85]">
              Nova bot surfaces · {visibleConnectors.length}
            </p>
            <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {visibleConnectors.map((connector) => (
                <button
                  key={connector.provider}
                  type="button"
                  onClick={() => setDetail(`bot:${connector.provider}`)}
                  aria-label={`Manage ${connector.provider} bot connection`}
                  className="flex min-w-0 items-center gap-3 rounded-xl py-3 pl-1 pr-2 text-left transition hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1a1a1d] text-[11px] font-semibold uppercase text-[#a0a0a0]">
                    {connector.provider.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium capitalize text-[#e4e4e4]">
                      {connector.provider} bot {connector.ready ? <Check aria-label="Connected" className="ml-1 inline size-3.5 text-emerald-400" /> : null}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-[#85858e]">
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
                  <ChevronRight className="size-4 text-[#71717a]" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-6 text-[11px] leading-5 text-[#71717a]">
          Nova web, desktop, and CLI use the supercode-cli server’s{" "}
          <span className="font-mono">/api/composio/*</span> endpoints. Connections and MCP
          tools belong to your Supercode CLI account, separate from Supercode Review integrations.
        </p>
      </div>
    </div>
  )
}
