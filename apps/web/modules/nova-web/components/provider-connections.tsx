"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Ellipsis, Loader2, Plus, Trash2 } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useSession } from "@/lib/auth-client"
import { modelLogo, PROVIDER_LOGOS, type BrandLogo } from "@/modules/nova-web/model-logos"
import { modelsForProvider, type HarnessProvider } from "@/modules/nova-web/models"

type CredentialProvider = "cursor" | "opencode"
type ConnectionId = CredentialProvider | "vercel" | "codex" | "nvidia" | "ollama" | "concentrateai"

type ProviderState = {
  connected: boolean
  enabled: boolean
  lastVerifiedAt: string | null
}

type ProviderModel = { id: string; label: string; count?: number }
type ConnectionDefinition = {
  id: ConnectionId
  label: string
  description: string
  credential: string
  managed?: boolean
  logo?: BrandLogo
  models: ProviderModel[]
  modelCount?: number
}

const CURATED_MODELS: ProviderModel[] = [
  { id: "anthropic", label: "Every Anthropic model", count: 14 },
  { id: "openai", label: "Every OpenAI model", count: 13 },
  { id: "xai", label: "Every xAI model", count: 3 },
  { id: "moonshot", label: "Every Moonshot model", count: 2 },
  { id: "zai", label: "Every Z.ai model", count: 2 },
  { id: "deepseek", label: "Every DeepSeek model", count: 4 },
  { id: "google", label: "Every Google model", count: 4 },
  { id: "qwen", label: "Every Qwen model", count: 2 },
  { id: "minimax", label: "Every MiniMax model", count: 2 },
  { id: "xiaomi", label: "Every Xiaomi model", count: 2 },
  { id: "tencent", label: "Every Tencent model", count: 3 },
  { id: "meituan", label: "Every Meituan model", count: 0 },
  { id: "meta", label: "Every Meta model", count: 2 },
  { id: "particle", label: "Every Particle model", count: 1 },
  { id: "nvidia", label: "Every nvidia model", count: 0 },
]

const BUILTIN_PROVIDERS: ConnectionDefinition[] = [
  { id: "vercel", label: "Vercel AI Gateway", description: "Vercel AI Gateway key is turned off, turn it on", credential: "Through ai-gateway.vercel.sh/v1", logo: { src: "/vercel.svg", monochrome: true }, models: CURATED_MODELS },
  { id: "codex", label: "OpenAI Codex", description: "Codex is turned off in settings, turn it on", credential: "ChatGPT subscription", logo: PROVIDER_LOGOS.codex, models: [] },
  { id: "nvidia", label: "NVIDIA", description: "NVIDIA key is turned off, turn it on", credential: "NVIDIA_API_KEY", logo: PROVIDER_LOGOS.nvidia, models: modelsForProvider("nvidia").slice(0, 10).map((entry) => ({ id: entry.id, label: entry.label })) },
  { id: "ollama", label: "Ollama Cloud", description: "Ollama Cloud key is turned off, turn it on", credential: "Ollama Cloud API key", logo: { src: "/logos/models/ollama.svg", monochrome: true }, models: [] },
  { id: "concentrateai", label: "concentrateai", description: "ConcentrateAI gateway", credential: "CONCENTRATEAI_API_KEY", logo: PROVIDER_LOGOS.concentrateai, models: modelsForProvider("concentrateai").map((entry) => ({ id: entry.id, label: entry.label })), modelCount: 44 },
]

const CREDENTIAL_PROVIDERS: ConnectionDefinition[] = [
  { id: "cursor", label: "Cursor Cloud Agents", description: "Cloud Agent runs from your Cursor subscription", credential: "Cursor API key", logo: PROVIDER_LOGOS.cursor, models: modelsForProvider("cursor").map((entry) => ({ id: entry.id, label: entry.label })) },
  { id: "opencode", label: "OpenCode Go", description: "OpenCode Go models through the inference API", credential: "OpenCode Go API key", logo: PROVIDER_LOGOS.opencode, models: modelsForProvider("opencode").map((entry) => ({ id: entry.id, label: entry.label })) },
]

const PROVIDERS = [...BUILTIN_PROVIDERS, ...CREDENTIAL_PROVIDERS]

export function useProviderConnectionStates() {
  const [states, setStates] = useState<Partial<Record<CredentialProvider, ProviderState>>>({})
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const entries = await Promise.all(CREDENTIAL_PROVIDERS.map(async (provider) => {
      try {
        const response = await fetch(`/api/nova/providers/${provider.id}/connection`, { credentials: "same-origin", cache: "no-store" })
        const body = await response.json() as ProviderState
        return [provider.id, response.ok ? body : { connected: false, enabled: false, lastVerifiedAt: null }] as const
      } catch {
        return [provider.id, { connected: false, enabled: false, lastVerifiedAt: null }] as const
      }
    }))
    setStates(Object.fromEntries(entries))
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    function onChange() { void refresh() }
    window.addEventListener("nova:provider-connection", onChange)
    return () => window.removeEventListener("nova:provider-connection", onChange)
  }, [refresh])

  return { states, loading, refresh }
}

export function ProviderConnectionsSection({ showHeading = true }: { showHeading?: boolean }) {
  const { states, loading, refresh } = useProviderConnectionStates()
  const { data: session } = useSession()
  const [connectOpen, setConnectOpen] = useState(false)
  const [selected, setSelected] = useState<CredentialProvider | null>(null)
  const [expanded, setExpanded] = useState<ConnectionId | null>(null)
  const [busy, setBusy] = useState<ConnectionId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [spreadUsage, setSpreadUsage] = useState(true)
  const [builtinEnabled, setBuiltinEnabled] = useState<Record<string, boolean>>({})
  const [enabledModels, setEnabledModels] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("nova:provider-enabled") ?? "{}") as Record<string, boolean>
      setBuiltinEnabled({ vercel: false, codex: false, nvidia: false, ollama: false, concentrateai: true, ...stored })
      setSpreadUsage(localStorage.getItem("nova:spread-provider-usage") === "true")
    } catch {
      setBuiltinEnabled({ vercel: false, codex: false, nvidia: false, ollama: false, concentrateai: true })
    }
  }, [])

  useEffect(() => {
    async function syncCodex() {
      try {
        const response = await fetch("/api/nova/codex/connection", { credentials: "same-origin", cache: "no-store" })
        const view = await response.json() as { state?: string }
        if (view.state !== "connected") return
        setBuiltinEnabled((current) => {
          if (Object.prototype.hasOwnProperty.call(current, "codex")) return current
          return { ...current, codex: true }
        })
      } catch { /* Codex status is optional for the provider table. */ }
    }
    void syncCodex()
    window.addEventListener("nova:codex-connection", syncCodex)
    return () => window.removeEventListener("nova:codex-connection", syncCodex)
  }, [])

  useEffect(() => {
    function onOpen(event: Event) {
      const provider = (event as CustomEvent<{ provider?: CredentialProvider }>).detail?.provider
      if (!provider || !CREDENTIAL_PROVIDERS.some((item) => item.id === provider)) return
      setSelected(provider)
      setConnectOpen(true)
      setError(null)
    }
    window.addEventListener("nova:open-provider-connect", onOpen)
    return () => window.removeEventListener("nova:open-provider-connect", onOpen)
  }, [])

  function openConnect(provider?: CredentialProvider) {
    setSelected(provider ?? CREDENTIAL_PROVIDERS.find((item) => !states[item.id]?.connected)?.id ?? "cursor")
    setConnectOpen(true)
    setError(null)
  }

  function setBuiltin(provider: ConnectionId, enabled: boolean) {
    setBuiltinEnabled((current) => {
      const next = { ...current, [provider]: enabled }
      try { localStorage.setItem("nova:provider-enabled", JSON.stringify(next)) } catch { /* Optional preference. */ }
      return next
    })
  }

  function managedAction(provider: ConnectionDefinition, action: string) {
    setError(`${provider.label} is managed by the Nova workspace. ${action} is unavailable here.`)
  }

  function toggleSpreadUsage() {
    setSpreadUsage((current) => {
      const next = !current
      try { localStorage.setItem("nova:spread-provider-usage", String(next)) } catch { /* Optional preference. */ }
      return next
    })
  }

  function modelEnabled(provider: ConnectionId, model: string) {
    return enabledModels[`${provider}:${model}`] !== false
  }

  function toggleModel(provider: ConnectionId, model: string) {
    const key = `${provider}:${model}`
    setEnabledModels((current) => ({ ...current, [key]: !modelEnabled(provider, model) }))
  }

  async function toggle(provider: CredentialProvider, enabled: boolean) {
    setBusy(provider); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not update provider")
      await refresh()
      window.dispatchEvent(new Event("nova:provider-connection"))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update provider")
    } finally { setBusy(null) }
  }

  async function testConnection(provider: ConnectionDefinition) {
    if (provider.managed) {
      setError(`${provider.label} is managed by the Nova workspace.`)
      return
    }
    setBusy(provider.id); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider.id}/models`, { credentials: "same-origin", cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Connection test failed")
      setError(`${provider.label} is connected. ${Array.isArray(body.models) ? body.models.length : 0} models available.`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Connection test failed")
    } finally { setBusy(null) }
  }

  async function disconnect(provider: CredentialProvider) {
    setBusy(provider); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "DELETE", credentials: "same-origin" })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not remove provider")
      setExpanded(null)
      await refresh()
      window.dispatchEvent(new Event("nova:provider-connection"))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not remove provider")
    } finally { setBusy(null) }
  }

  const connectedCredentialProviders = CREDENTIAL_PROVIDERS.filter((provider) => states[provider.id]?.connected)
  const connectionCount = BUILTIN_PROVIDERS.length + connectedCredentialProviders.length
  const showCard = showHeading || loading || connectionCount > 0

  return (
    <section aria-labelledby="provider-connections-heading" className={showHeading ? "mt-8" : "mt-3"}>
      {showHeading ? <div>
        <h2 id="provider-connections-heading" className="text-[13px] font-medium">Your connections</h2>
        <p className="mt-2 text-[12px] text-[#8a8a8a]">Threads you own run on these first, in this order</p>
      </div> : null}
      {showCard ? <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1b1b1b]">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 text-[13px]">
          <span>{connectionCount} connections</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Connect provider" className="text-[#777] hover:text-white"><Plus className="size-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#292929] p-1.5 text-[#ededed]">
              <DropdownMenuLabel className="text-[11px] font-normal text-[#888]">Subscriptions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event("nova:open-codex-connect"))} className="cursor-pointer text-[12px] focus:bg-white/5">OpenAI Codex</DropdownMenuItem>
              {CREDENTIAL_PROVIDERS.map((provider) => <DropdownMenuItem key={provider.id} onSelect={() => openConnect(provider.id)} className="cursor-pointer text-[12px] focus:bg-white/5">{provider.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_58px_82px] border-b border-white/[0.08] px-4 py-2 text-[10px] text-[#666] sm:grid-cols-[minmax(0,1fr)_72px_72px_90px_80px]"><span className="pl-11">Account</span><span>5h</span><span>7d</span><span>Resets</span><span /></div>
        {loading && connectedCredentialProviders.length === 0 ? <div className="sr-only">Loading provider credentials</div> : null}
        {BUILTIN_PROVIDERS.map((provider) => {
          const enabled = builtinEnabled[provider.id] ?? provider.id === "concentrateai"
          const rowProvider = provider.id === "codex" && session?.user?.email ? { ...provider, label: session.user.email } : provider
          return <ConnectionRow key={provider.id} provider={rowProvider} enabled={enabled} busy={busy === provider.id} expanded={expanded === provider.id} onToggle={(next) => setBuiltin(provider.id, next)} onExpand={() => setExpanded(expanded === provider.id ? null : provider.id)} modelEnabled={modelEnabled} onToggleModel={toggleModel} onTest={() => void testConnection(provider)} onEdit={() => provider.id === "codex" ? window.dispatchEvent(new Event("nova:open-codex-connect")) : managedAction(provider, "Editing")} onMove={() => managedAction(provider, "Moving to an organization")} onRemove={() => managedAction(provider, "Removing")} />
        })}
        {connectedCredentialProviders.map((provider) => {
          const state = states[provider.id]!
          return <ConnectionRow key={provider.id} provider={provider} enabled={state.enabled} busy={busy === provider.id} expanded={expanded === provider.id} onToggle={(next) => void toggle(provider.id, next)} onExpand={() => setExpanded(expanded === provider.id ? null : provider.id)} modelEnabled={modelEnabled} onToggleModel={toggleModel} onTest={() => void testConnection(provider)} onEdit={() => openConnect(provider.id)} onRemove={() => void disconnect(provider.id)} />
        })}
        <div className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[13px]">Spread usage across my subscriptions</p><p className="mt-0.5 max-w-[620px] text-[12px] leading-4 text-[#777]">Threads move between subscriptions that serve the same model, keeping each thread on one while its cache is warm.</p></div><button type="button" role="switch" aria-checked={spreadUsage} aria-label="Spread usage across subscriptions" onClick={toggleSpreadUsage} className={cn("relative h-5 w-9 shrink-0 rounded-full transition", spreadUsage ? "bg-[#5276ff]" : "bg-[#3a3a3a]")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition", spreadUsage ? "left-[18px]" : "left-0.5")} /></button></div>
      </div> : null}
      {error ? <p role="alert" className="mt-2 text-[12px] text-red-300">{error}</p> : null}

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="gap-4 rounded-xl border-white/15 bg-[#292929] p-5 text-[#ededed] sm:max-w-[440px]"><DialogTitle className="text-[14px] font-medium">Connect a provider</DialogTitle><DialogDescription className="text-[13px] text-[#999]">Use a provider API key. Nova encrypts it and keeps it saved until you remove it.</DialogDescription><div className="grid gap-2">{CREDENTIAL_PROVIDERS.map((provider) => { const isConnected = states[provider.id]?.connected; return <button key={provider.id} type="button" disabled={Boolean(isConnected)} onClick={() => setSelected(provider.id)} className={cn("flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition", selected === provider.id ? "border-[#2dd4bf]/60 bg-[#2dd4bf]/10" : "border-white/10 hover:bg-white/5", isConnected && "cursor-not-allowed opacity-45")}><ProviderLogo logo={provider.logo} fallback={provider.label[0]} /><span className="min-w-0 flex-1"><span className="block text-[13px]">{provider.label}</span><span className="mt-0.5 block text-[11px] text-[#888]">{isConnected ? "Already connected" : provider.description}</span></span>{selected === provider.id ? <Check className="size-4 text-[#2dd4bf]" /> : null}</button> })}</div>{selected ? <ProviderCredentialForm provider={selected} onConnected={async () => { setConnectOpen(false); await refresh(); window.dispatchEvent(new Event("nova:provider-connection")) }} /> : null}</DialogContent>
      </Dialog>
    </section>
  )
}

function ConnectionRow({ provider, enabled, busy, expanded, onToggle, onExpand, onTest, onEdit, onMove, onRemove, modelEnabled, onToggleModel }: { provider: ConnectionDefinition; enabled: boolean; busy: boolean; expanded: boolean; onToggle: (enabled: boolean) => void; onExpand: () => void; onTest: () => void; onEdit?: () => void; onMove?: () => void; onRemove?: () => void; modelEnabled: (provider: ConnectionId, model: string) => boolean; onToggleModel: (provider: ConnectionId, model: string) => void }) {
  return <div className="border-b border-white/[0.07] last:border-b-0">
    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_42px_42px_58px_82px] items-center gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_72px_72px_90px_80px]">
      <div className="flex min-w-0 items-center gap-3"><ProviderLogo logo={provider.logo} fallback={provider.label[0]} /><div className="min-w-0"><p className="truncate text-[13px] text-[#e5e5e5]">{provider.label}</p><p className="mt-0.5 truncate text-[12px] text-[#888]">{enabled ? (provider.modelCount ? `Serves ${provider.modelCount} models` : provider.models.length ? `Serves ${provider.models.length} models` : provider.id === "codex" ? "Codex, Plus plan" : provider.description) : provider.description}</p></div></div>
      <span className="text-[11px] text-[#777]">—</span><span className="text-[11px] text-[#777]">—</span><span className="text-[11px] text-[#777]">—</span>
      <div className="flex items-center justify-end gap-1"><button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? "Turn off" : "Turn on"} ${provider.label}`} disabled={busy} onClick={() => onToggle(!enabled)} className={cn("relative h-5 w-9 rounded-full transition", enabled ? "bg-[#5276ff]" : "bg-[#3a3a3a]", busy && "opacity-50")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition", enabled ? "left-[18px]" : "left-0.5")} /></button><DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${provider.label}`} className="rounded-md p-1 text-[#777] hover:bg-white/5 hover:text-white"><Ellipsis className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48 border-white/10 bg-[#292929] text-[#ededed]"><DropdownMenuItem onSelect={() => onEdit?.()} className="cursor-pointer text-[12px] focus:bg-white/5">Edit</DropdownMenuItem><DropdownMenuItem onSelect={onTest} className="cursor-pointer text-[12px] focus:bg-white/5">Test connection</DropdownMenuItem><DropdownMenuItem onSelect={() => onMove?.()} className="cursor-pointer text-[12px] focus:bg-white/5">Move to organization</DropdownMenuItem><DropdownMenuSeparator className="bg-white/10" /><DropdownMenuItem onSelect={() => onRemove?.()} className="cursor-pointer text-[12px] text-red-300 focus:bg-red-500/10 focus:text-red-200">Remove</DropdownMenuItem></DropdownMenuContent></DropdownMenu><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${provider.label}`} onClick={onExpand} className="rounded-md p-1 text-[#777] hover:bg-white/5 hover:text-white"><ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} /></button></div>
    </div>
    {expanded ? <div className="border-t border-white/[0.06] bg-black/10 px-4 py-3 sm:pl-[60px]"><p className="break-all font-mono text-[10px] text-[#777]">{provider.credential}</p><div className="mt-3 space-y-2">{provider.models.map((entry) => <label key={entry.id} className={cn("flex items-center gap-2 text-[12px]", entry.count === 0 ? "text-[#777]" : "text-[#c8c8c8]")}><input type="checkbox" disabled={entry.count === 0} checked={entry.count === 0 ? false : modelEnabled(provider.id, entry.id)} onChange={() => onToggleModel(provider.id, entry.id)} className="size-3.5 accent-[#5276ff] disabled:opacity-40" /><span className="flex min-w-0 flex-1 items-center gap-2 truncate"><ProviderLogo logo={modelLogo({ id: entry.id, provider: "concentrateai", label: entry.label, desc: "" })} fallback={entry.label[0]} small />{entry.label}</span>{entry.count !== undefined ? <span className="text-[10px] text-[#777]">{entry.count} ›</span> : null}</label>)}</div><div className="mt-3 flex flex-wrap gap-2">{onEdit ? <button type="button" onClick={onEdit} className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#bcbcbc] hover:bg-white/5">Edit credentials</button> : null}{onRemove ? <button type="button" onClick={onRemove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="size-3" />Remove</button> : null}</div></div> : null}
  </div>
}

function ProviderCredentialForm({ provider, onConnected }: { provider: CredentialProvider; onConnected: () => Promise<void> }) {
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const meta = CREDENTIAL_PROVIDERS.find((item) => item.id === provider)!

  async function save() {
    setBusy(true); setMessage(null)
    try { const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) }); const body = await response.json(); if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not connect provider"); await onConnected() } catch (failure) { setMessage(failure instanceof Error ? failure.message : "Could not connect provider") } finally { setBusy(false) }
  }

  return <div className="border-t border-white/10 pt-4"><label className="block text-[12px] text-[#aaa]" htmlFor={`provider-key-${provider}`}>{meta.credential}</label><div className="mt-2 flex gap-2"><input id={`provider-key-${provider}`} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste API key" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#2dd4bf]/60" /><button type="button" onClick={() => void save()} disabled={busy || !apiKey.trim()} className="rounded-lg bg-[#2dd4bf] px-3 py-2 text-xs font-medium text-black disabled:opacity-40">{busy ? "Checking…" : "Connect"}</button></div>{message ? <p role="alert" className="mt-2 text-xs text-red-300">{message}</p> : null}</div>
}

function ProviderLogo({ logo, fallback, small = false }: { logo?: BrandLogo; fallback: string; small?: boolean }) {
  const box = small ? "size-4" : "size-8"
  const mark = small ? "size-3" : "size-4"
  if (!logo) return <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[#bcbcbc]", box, small ? "text-[8px]" : "text-[12px]")}>{fallback}</span>
  return logo.monochrome ? <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-md bg-white/[0.06]", box, small ? "p-0.5" : "p-1.5")}><span className={cn("bg-current text-[#bcbcbc]", mark)} style={{ maskImage: `url(${logo.src})`, maskSize: "contain", maskPosition: "center", maskRepeat: "no-repeat" }} /></span> : <img src={logo.src} alt="" className={cn("rounded-md object-contain", box)} />
}
