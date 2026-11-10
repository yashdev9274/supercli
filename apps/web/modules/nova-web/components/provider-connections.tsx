"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Ellipsis, Loader2, Plus, Search, Trash2, X } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useSession } from "@/lib/auth-client"
import { modelLogo, PROVIDER_LOGOS, type BrandLogo } from "@/modules/nova-web/model-logos"
import { modelsForProvider } from "@/modules/nova-web/models"
import { API_KEY_PROVIDER_IDS, PROVIDER_INTEGRATIONS, PROVIDER_INTEGRATION_BY_ID, type ProviderIntegration } from "@/modules/nova-web/provider-integrations"

type ProviderModel = { id: string; label: string; count?: number; description?: string }
export type ProviderState = { connected: boolean; enabled: boolean; lastVerifiedAt: string | null; name?: string; baseUrl?: string; models?: ProviderModel[] }
export type ConnectionId = string

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
  { id: "anthropic", label: "Every Anthropic model", count: 14 }, { id: "openai", label: "Every OpenAI model", count: 13 },
  { id: "xai", label: "Every xAI model", count: 3 }, { id: "moonshot", label: "Every Moonshot model", count: 2 },
  { id: "zai", label: "Every Z.ai model", count: 2 }, { id: "deepseek", label: "Every DeepSeek model", count: 4 },
  { id: "google", label: "Every Google model", count: 4 }, { id: "qwen", label: "Every Qwen model", count: 2 },
]

const BUILTIN_PROVIDERS: ConnectionDefinition[] = [
  { id: "vercel", label: "Vercel AI Gateway", description: "Vercel AI Gateway key is turned off, turn it on", credential: "Through ai-gateway.vercel.sh/v1", logo: PROVIDER_INTEGRATION_BY_ID.vercel.logo, models: CURATED_MODELS },
  { id: "codex", label: "OpenAI Codex", description: "Codex is turned off in settings, turn it on", credential: "ChatGPT subscription", logo: PROVIDER_LOGOS.codex, models: [] },
  { id: "nvidia", label: "NVIDIA", description: "NVIDIA key is turned off, turn it on", credential: "NVIDIA_API_KEY", logo: PROVIDER_INTEGRATION_BY_ID.nvidia.logo, models: modelsForProvider("nvidia").slice(0, 10).map((entry) => ({ id: entry.id, label: entry.label })) },
  { id: "ollama", label: "Ollama Cloud", description: "Ollama Cloud key is turned off, turn it on", credential: "Ollama Cloud API key", logo: PROVIDER_INTEGRATION_BY_ID.ollama.logo, models: [] },
  { id: "concentrateai", label: "concentrateai", description: "ConcentrateAI gateway", credential: "CONCENTRATEAI_API_KEY", logo: PROVIDER_LOGOS.concentrateai, models: modelsForProvider("concentrateai").map((entry) => ({ id: entry.id, label: entry.label })), modelCount: 44 },
]

const API_KEY_PROVIDERS: ConnectionDefinition[] = PROVIDER_INTEGRATIONS.filter((item) => API_KEY_PROVIDER_IDS.includes(item.id)).map((item) => ({
  id: item.id, label: item.label, description: item.subtitle, credential: item.credentialLabel, logo: item.logo, models: [],
}))
const CREDENTIAL_PROVIDERS = [...API_KEY_PROVIDERS.filter((item) => item.id === "cursor" || item.id === "opencode"), ...API_KEY_PROVIDERS.filter((item) => item.id !== "cursor" && item.id !== "opencode")]
const ALL_CONNECTABLE = PROVIDER_INTEGRATIONS

export function useProviderConnectionStates() {
  const [states, setStates] = useState<Partial<Record<string, ProviderState>>>({})
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true)
    const entries = await Promise.all(API_KEY_PROVIDER_IDS.map(async (provider) => {
      try {
        const response = await fetch(`/api/nova/providers/${provider}/connection`, { credentials: "same-origin", cache: "no-store" })
        const body = await response.json() as ProviderState
        return [provider, response.ok ? body : { connected: false, enabled: false, lastVerifiedAt: null }] as const
      } catch { return [provider, { connected: false, enabled: false, lastVerifiedAt: null }] as const }
    }))
    setStates(Object.fromEntries(entries))
    setLoading(false)
  }, [])
  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener("nova:provider-connection", onChange)
    return () => window.removeEventListener("nova:provider-connection", onChange)
  }, [refresh])
  return { states, loading, refresh }
}

export function ProviderConnectionsSection({ showHeading = true }: { showHeading?: boolean }) {
  const { states, loading, refresh } = useProviderConnectionStates()
  const { data: session } = useSession()
  const [connectOpen, setConnectOpen] = useState(false)
  const [selected, setSelected] = useState<ProviderIntegration | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState("")
  const [spreadUsage, setSpreadUsage] = useState(false)
  const [builtinEnabled, setBuiltinEnabled] = useState<Record<string, boolean>>({})
  const [enabledModels, setEnabledModels] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("nova:provider-enabled") ?? "{}") as Record<string, boolean>
      setBuiltinEnabled({ vercel: false, codex: false, nvidia: false, ollama: false, concentrateai: true, ...stored })
      setSpreadUsage(localStorage.getItem("nova:spread-provider-usage") === "true")
    } catch { setBuiltinEnabled({ vercel: false, codex: false, nvidia: false, ollama: false, concentrateai: true }) }
  }, [])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const provider = (event as CustomEvent<{ provider?: string }>).detail?.provider
      const meta = provider ? PROVIDER_INTEGRATION_BY_ID[provider] : undefined
      if (meta) { setSelected(meta); setConnectOpen(true); setError(null) }
    }
    window.addEventListener("nova:open-provider-connect", onOpen)
    return () => window.removeEventListener("nova:open-provider-connect", onOpen)
  }, [])

  const connectedCredentialProviders = API_KEY_PROVIDERS.filter((provider) => states[provider.id]?.connected)
  const connectedExtraProviders = connectedCredentialProviders.filter((provider) => !BUILTIN_PROVIDERS.some((item) => item.id === provider.id))
  const connectionCount = BUILTIN_PROVIDERS.length + connectedExtraProviders.length
  const showCard = showHeading || loading || connectionCount > 0
  const pickerItems = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase()
    return ALL_CONNECTABLE.filter((item) => !query || item.label.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query))
  }, [pickerQuery])

  function openPicker() { setSelected(null); setPickerQuery(""); setError(null); setConnectOpen(true) }
  function setBuiltin(provider: string, enabled: boolean) {
    setBuiltinEnabled((current) => { const next = { ...current, [provider]: enabled }; try { localStorage.setItem("nova:provider-enabled", JSON.stringify(next)) } catch {} return next })
  }
  function modelEnabled(provider: string, model: string) { return enabledModels[`${provider}:${model}`] !== false }
  function toggleModel(provider: string, model: string) { const key = `${provider}:${model}`; setEnabledModels((current) => ({ ...current, [key]: !modelEnabled(provider, model) })) }
  async function toggle(provider: string, enabled: boolean) {
    setBusy(provider); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not update provider")
      await refresh(); window.dispatchEvent(new Event("nova:provider-connection"))
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not update provider") }
    finally { setBusy(null) }
  }
  async function disconnect(provider: string) {
    setBusy(provider); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "DELETE", credentials: "same-origin" })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not remove provider")
      setExpanded(null); await refresh(); window.dispatchEvent(new Event("nova:provider-connection"))
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not remove provider") }
    finally { setBusy(null) }
  }
  async function testConnection(provider: string) {
    setBusy(provider); setError(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/models`, { credentials: "same-origin", cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Connection test failed")
      setError(`${PROVIDER_INTEGRATION_BY_ID[provider]?.label ?? provider} is connected. ${Array.isArray(body.models) ? body.models.length : 0} models available.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Connection test failed") }
    finally { setBusy(null) }
  }

  return <section aria-labelledby="provider-connections-heading" className={showHeading ? "mt-8" : "mt-3"}>
    {showHeading ? <><h2 id="provider-connections-heading" className="text-[13px] font-medium">Your connections</h2><p className="mt-2 text-[12px] text-[#8a8a8a]">Threads you own run on these first, in this order</p></> : null}
    {showCard ? <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1b1b1b]">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3 text-[13px]"><span>{connectionCount} connections</span><button type="button" aria-label="Add a connection" onClick={openPicker} className="rounded-md p-1 text-[#777] hover:bg-white/5 hover:text-white"><Plus className="size-3.5" /></button></div>
      <div className="grid grid-cols-[minmax(0,1fr)_42px_42px_58px_82px] border-b border-white/[0.08] px-4 py-2 text-[10px] text-[#666] sm:grid-cols-[minmax(0,1fr)_72px_72px_90px_80px]"><span className="pl-11">Account</span><span>5h</span><span>7d</span><span>Resets</span><span /></div>
      {BUILTIN_PROVIDERS.map((provider) => {
        const credentialBacked = API_KEY_PROVIDER_IDS.includes(provider.id)
        const state = states[provider.id]
        const enabled = credentialBacked ? Boolean(state?.connected && state.enabled) : (builtinEnabled[provider.id] ?? provider.id === "concentrateai")
        const rowProvider = {
          ...provider,
          ...(provider.id === "codex" && session?.user?.email ? { label: session.user.email } : {}),
          ...(credentialBacked && state?.models?.length ? { models: state.models, modelCount: state.models.length } : {}),
        }
        const onCredentialToggle = (next: boolean) => {
          if (!state?.connected) {
            if (next) { setSelected(PROVIDER_INTEGRATION_BY_ID[provider.id] ?? null); setConnectOpen(true) }
            return
          }
          void toggle(provider.id, next)
        }
        return <ConnectionRow key={provider.id} provider={rowProvider} enabled={enabled} busy={busy === provider.id} expanded={expanded === provider.id} onToggle={(next) => credentialBacked ? onCredentialToggle(next) : setBuiltin(provider.id, next)} onExpand={() => setExpanded(expanded === provider.id ? null : provider.id)} modelEnabled={modelEnabled} onToggleModel={toggleModel} onTest={() => void testConnection(provider.id)} onEdit={() => { if (provider.id === "codex") window.dispatchEvent(new Event("nova:open-codex-connect")); else { setSelected(PROVIDER_INTEGRATION_BY_ID[provider.id] ?? null); setConnectOpen(true) } }} onRemove={() => credentialBacked && state?.connected ? void disconnect(provider.id) : setError(`${provider.label} is managed by the Nova workspace.`)} />
      })}
      {connectedExtraProviders.map((provider) => { const state = states[provider.id]!; const definition = { id: provider.id, label: state.name || provider.label, description: provider.description, credential: provider.credential, logo: provider.logo, models: state.models ?? [] }; return <ConnectionRow key={provider.id} provider={definition} enabled={state.enabled} busy={busy === provider.id} expanded={expanded === provider.id} onToggle={(next) => void toggle(provider.id, next)} onExpand={() => setExpanded(expanded === provider.id ? null : provider.id)} modelEnabled={modelEnabled} onToggleModel={toggleModel} onTest={() => void testConnection(provider.id)} onEdit={() => { setSelected(PROVIDER_INTEGRATION_BY_ID[provider.id] ?? null); setConnectOpen(true) }} onRemove={() => void disconnect(provider.id)} /> })}
      <div className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[13px]">Spread usage across my subscriptions</p><p className="mt-0.5 max-w-[620px] text-[12px] leading-4 text-[#777]">Threads move between subscriptions that serve the same model, keeping each thread on one while its cache is warm.</p></div><SwitchControl checked={spreadUsage} label="Spread usage across subscriptions" onChange={(next) => { setSpreadUsage(next); try { localStorage.setItem("nova:spread-provider-usage", String(next)) } catch {} }} /></div>
    </div> : null}
    {error ? <p role="alert" className="mt-2 text-[12px] text-red-300">{error}</p> : null}
    <Dialog open={connectOpen} onOpenChange={(open) => { setConnectOpen(open); if (!open) setSelected(null) }}>
      <DialogContent className="max-h-[calc(100vh-24px)] gap-0 overflow-y-auto rounded-xl border-white/15 bg-[#121212] p-0 text-[#ededed] sm:max-w-[620px]">
        {!selected ? <ProviderPicker query={pickerQuery} onQueryChange={setPickerQuery} items={pickerItems} states={states} onClose={() => setConnectOpen(false)} onSelect={(provider) => { if (provider.id === "codex") { setConnectOpen(false); window.dispatchEvent(new Event("nova:open-codex-connect")) } else setSelected(provider) }} /> : <ProviderConnectionCard provider={selected} existing={states[selected.id]} onBack={() => setSelected(null)} onConnected={async () => { setConnectOpen(false); setSelected(null); await refresh(); window.dispatchEvent(new Event("nova:provider-connection")) }} />}
      </DialogContent>
    </Dialog>
  </section>
}

function ProviderPicker({ query, onQueryChange, items, states, onSelect, onClose }: { query: string; onQueryChange: (value: string) => void; items: ProviderIntegration[]; states: Partial<Record<string, ProviderState>>; onSelect: (provider: ProviderIntegration) => void; onClose: () => void }) {
  const groups: Array<[string, ProviderIntegration[]]> = ["subscription", "gateway", "api-key", "custom"].map((category) => [category, items.filter((item) => item.category === category)] as [string, ProviderIntegration[]])
  const labels: Record<string, string> = { subscription: "Subscriptions", gateway: "Gateways", "api-key": "API keys", custom: "Custom" }
  return <div className="p-4 sm:p-5"><div className="flex items-center justify-between"><DialogTitle className="text-[14px] font-medium">Add a connection</DialogTitle><button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-[#777] hover:text-white"><X className="size-4" /></button></div><DialogDescription className="sr-only">Choose a provider to connect to Nova.</DialogDescription><div className="relative mt-4"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#666]" /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search providers" aria-label="Search providers" className="h-8 w-full rounded-md border border-white/10 bg-[#181818] pl-8 pr-3 text-[12px] text-white outline-none placeholder:text-[#555] focus:border-white/20" /></div>{groups.map(([category, providers]) => providers.length ? <div key={category} className="mt-5"><p className="mb-2 text-[12px] text-[#ddd]">{labels[category]}</p><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{providers.map((provider) => <button key={provider.id} type="button" onClick={() => onSelect(provider)} className="flex min-h-[62px] items-center gap-3 rounded-lg border border-white/10 bg-[#1c1c1c] px-3 text-left transition hover:border-white/20 hover:bg-[#222]"><ProviderLogo logo={provider.logo} fallback={provider.label[0]} /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-[#ededed]">{provider.label}</span><span className="mt-0.5 block truncate text-[11px] text-[#888]">{states[provider.id]?.connected ? "Connected" : provider.subtitle}</span></span>{provider.id === "codex" ? <span className="text-[11px] text-[#777]">Add another</span> : states[provider.id]?.connected ? <Check className="size-3.5 text-[#8aa0ff]" /> : null}</button>)}</div></div> : null)}</div>
}

function ProviderConnectionCard({ provider, existing, onBack, onConnected }: { provider: ProviderIntegration; existing?: ProviderState; onBack: () => void; onConnected: () => Promise<void> }) {
  const [name, setName] = useState(existing?.name ?? "")
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? provider.baseUrl)
  const [apiKey, setApiKey] = useState("")
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([])
  const [models, setModels] = useState<ProviderModel[]>(existing?.models ?? [])
  const [modelId, setModelId] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const isSubscription = provider.category === "subscription"
  const endpoint = baseUrl.replace(/\/$/, "")
  const requestHint = endpoint ? `Requests go to ${endpoint}/chat/completions` : "Enter the provider base URL to continue"

  async function checkAccess() {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider.id}/models`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, baseUrl, name, apiFamily: provider.apiFamily, headers: Object.fromEntries(headers.filter((entry) => entry.key.trim()).map((entry) => [entry.key.trim(), entry.value])) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not check access")
      if (Array.isArray(body.models)) setModels(body.models)
      setChecked(true); setMessage(`Access confirmed. ${Array.isArray(body.models) ? body.models.length : 0} models available.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not check access") }
    finally { setBusy(false) }
  }
  async function save() {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider.id}/connection`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey, baseUrl, name, apiFamily: provider.apiFamily, models, headers: Object.fromEntries(headers.filter((entry) => entry.key.trim()).map((entry) => [entry.key.trim(), entry.value])) }) })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not connect provider")
      await onConnected()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect provider") }
    finally { setBusy(false) }
  }

  if (isSubscription) return <div className="p-5"><button type="button" onClick={onBack} className="text-[12px] text-[#999] hover:text-white">← Back</button><div className="mt-5 flex items-center gap-3"><ProviderLogo logo={provider.logo} fallback={provider.label[0]} /><div><DialogTitle className="text-[14px]">Connect {provider.label}</DialogTitle><DialogDescription className="mt-1 text-[12px] text-[#888]">Use the provider's sign-in flow from its settings integration.</DialogDescription></div></div><p className="mt-6 rounded-lg border border-white/10 bg-[#1c1c1c] p-3 text-[12px] text-[#aaa]">This subscription connection is managed by the existing Nova account flow.</p></div>
  return <div className="flex min-h-[calc(100vh-24px)] flex-col p-4 sm:p-5"><div className="flex items-center gap-2"><button type="button" onClick={onBack} className="text-[12px] text-[#999] hover:text-white">←</button><ProviderLogo logo={provider.logo} fallback={provider.label[0]} small /><DialogTitle className="text-[14px]">Connect {provider.label}</DialogTitle></div><DialogDescription className="mt-5 text-[12px] text-[#aaa]">Endpoint</DialogDescription><div className="mt-2 rounded-lg border border-white/10 bg-[#1b1b1b] p-4"><label className="block text-[12px] text-[#ddd]">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder={`${provider.label} (ZDR)`} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 text-[12px] text-white outline-none focus:border-[#5276ff]" /></label><label className="mt-3 block text-[12px] text-[#ddd]">Base URL<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-provider.example/v1" className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 text-[12px] text-white outline-none focus:border-[#5276ff]" /><span className="mt-1 block truncate text-[11px] text-[#777]">{requestHint}</span></label><label className="mt-3 block text-[12px] text-[#ddd]">API key<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="API key" className="mt-1 h-8 w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 text-[12px] text-white outline-none focus:border-[#5276ff]" /></label>{provider.docsUrl ? <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="mt-2 block text-[11px] text-[#d1d1d1] hover:text-white">Get a key from {provider.label} ↗</a> : null}<div className="mt-4"><div className="mb-2 flex items-center justify-between text-[12px] text-[#ddd]">Headers<button type="button" onClick={() => setHeaders((current) => [...current, { key: "", value: "" }])} className="rounded-md bg-[#2b2b2b] px-3 py-1 text-[11px] text-[#ddd] hover:bg-[#333]">+ Add header</button></div>{headers.map((header, index) => <div key={index} className="mt-2 flex gap-2"><input value={header.key} onChange={(event) => setHeaders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder="Header" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#1a1a1a] px-2 py-1.5 text-[11px]" /><input value={header.value} onChange={(event) => setHeaders((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} placeholder="Value" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#1a1a1a] px-2 py-1.5 text-[11px]" /></div>)}</div><div className="mt-4 flex justify-end"><button type="button" onClick={() => void checkAccess()} disabled={busy || !apiKey.trim() || !baseUrl.trim()} className="rounded-md bg-[#2a2a2a] px-3 py-2 text-[12px] text-[#aaa] disabled:opacity-50">{busy ? <Loader2 className="mr-1 inline size-3 animate-spin" /> : null}Check access</button></div></div><div className="mt-3 rounded-lg border border-white/10 bg-[#1b1b1b]"><div className="border-b border-white/10 px-4 py-3 text-[12px]">Models</div><div className="border-b border-white/10 px-4 py-3 text-[12px] text-[#ddd]">Serves {models.length} models</div><p className="px-4 py-3 text-[11px] text-[#777]">{checked ? "Models returned by the provider" : "Check access to list the models"}</p><div className="border-t border-white/10 p-3"><div className="flex gap-2"><input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="Add a model by id" className="min-w-0 flex-1 rounded-md border border-white/10 bg-[#1a1a1a] px-2 py-1.5 text-[11px]" /><button type="button" onClick={() => { if (!modelId.trim()) return; setModels((current) => [...current, { id: modelId.trim(), label: modelId.trim() }]); setModelId("") }} className="text-[11px] text-[#aaa] hover:text-white">+ Add</button></div>{models.slice(0, 8).map((model) => <div key={model.id} className="mt-2 flex items-center justify-between text-[11px] text-[#bbb]"><span className="truncate">{model.label}</span><span className="ml-2 text-[#666]">{model.id}</span></div>)}</div></div>{message ? <p role="status" className="mt-3 text-[11px] text-[#aaa]">{message}</p> : null}<div className="mt-auto flex items-center justify-between border-t border-white/10 pt-6">{provider.docsUrl ? <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-[11px] text-[#6e9bff] hover:text-white">Connection help ↗</a> : <span />}<div className="flex items-center gap-3"><button type="button" onClick={onBack} className="text-[12px] text-[#999] hover:text-white">Cancel</button><button type="button" onClick={() => void save()} disabled={busy || !apiKey.trim() || !baseUrl.trim()} className="rounded-md bg-[#4969d8] px-3 py-2 text-[12px] text-white disabled:opacity-40">{busy ? "Connecting…" : "Connect"}</button></div></div></div>
}

function ConnectionRow({ provider, enabled, busy, expanded, onToggle, onExpand, onTest, onEdit, onRemove, modelEnabled, onToggleModel }: { provider: ConnectionDefinition; enabled: boolean; busy: boolean; expanded: boolean; onToggle: (enabled: boolean) => void; onExpand: () => void; onTest: () => void; onEdit?: () => void; onRemove?: () => void; modelEnabled: (provider: string, model: string) => boolean; onToggleModel: (provider: string, model: string) => void }) {
  const displayLogo = PROVIDER_INTEGRATION_BY_ID[provider.id]?.logo ?? provider.logo
  return <div className="border-b border-white/[0.07] last:border-b-0"><div className="grid min-h-16 grid-cols-[minmax(0,1fr)_42px_42px_58px_82px] items-center gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_72px_72px_90px_80px]"><div className="flex min-w-0 items-center gap-3"><ProviderLogo logo={displayLogo} fallback={provider.label[0]} /><div className="min-w-0"><p className="truncate text-[13px] text-[#e5e5e5]">{provider.label}</p><p className="mt-0.5 truncate text-[12px] text-[#888]">{enabled ? (provider.modelCount ? `Serves ${provider.modelCount} models` : provider.models.length ? `Serves ${provider.models.length} models` : provider.id === "codex" ? "Codex, Plus plan" : provider.description) : provider.description}</p></div></div><span className="text-[11px] text-[#777]">—</span><span className="text-[11px] text-[#777]">—</span><span className="text-[11px] text-[#777]">—</span><div className="flex items-center justify-end gap-1"><SwitchControl checked={enabled} disabled={busy} label={`${enabled ? "Turn off" : "Turn on"} ${provider.label}`} onChange={onToggle} /><DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${provider.label}`} className="rounded-md p-1 text-[#777] hover:bg-white/5 hover:text-white"><Ellipsis className="size-4" /></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48 border-white/10 bg-[#292929] text-[#ededed]"><DropdownMenuItem onSelect={() => onEdit?.()} className="cursor-pointer text-[12px] focus:bg-white/5">Edit</DropdownMenuItem><DropdownMenuItem onSelect={onTest} className="cursor-pointer text-[12px] focus:bg-white/5">Test connection</DropdownMenuItem><DropdownMenuSeparator className="bg-white/10" /><DropdownMenuItem onSelect={() => onRemove?.()} className="cursor-pointer text-[12px] text-red-300 focus:bg-red-500/10 focus:text-red-200">Remove</DropdownMenuItem></DropdownMenuContent></DropdownMenu><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${provider.label}`} onClick={onExpand} className="rounded-md p-1 text-[#777] hover:bg-white/5 hover:text-white"><ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} /></button></div></div>{expanded ? <div className="border-t border-white/[0.06] bg-black/10 px-4 py-3 sm:pl-[60px]"><p className="break-all font-mono text-[10px] text-[#777]">{provider.credential}</p><div className="mt-3 space-y-2">{provider.models.map((entry) => <label key={entry.id} className="flex items-center gap-2 text-[12px] text-[#c8c8c8]"><input type="checkbox" checked={modelEnabled(provider.id, entry.id)} onChange={() => onToggleModel(provider.id, entry.id)} className="size-3.5 accent-[#5276ff]" /><span className="flex min-w-0 flex-1 items-center gap-2 truncate"><ProviderLogo logo={modelLogo({ id: entry.id, provider: "concentrateai", label: entry.label, desc: "" })} fallback={entry.label[0]} small />{entry.label}</span>{entry.count !== undefined ? <span className="text-[10px] text-[#777]">{entry.count} ›</span> : null}</label>)}</div><div className="mt-3 flex flex-wrap gap-2">{onEdit ? <button type="button" onClick={onEdit} className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-[#bcbcbc] hover:bg-white/5">Edit credentials</button> : null}{onRemove ? <button type="button" onClick={onRemove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/20 px-2.5 py-1 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 className="size-3" />Remove</button> : null}</div></div> : null}</div>
}

function SwitchControl({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-pressed={checked} data-state={checked ? "checked" : "unchecked"} aria-label={label} disabled={disabled} onClick={(event) => { event.stopPropagation(); onChange(!checked) }} className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-[#5276ff]", checked ? "border-[#5276ff] bg-[#5276ff]" : "border-white/10 bg-[#3a3a3a]", disabled && "cursor-wait opacity-50")}><span className={cn("block size-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[17px]" : "translate-x-0.5")} /></button>
}

function ProviderLogo({ logo, fallback, small = false }: { logo?: BrandLogo; fallback: string; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  const box = small ? "size-4" : "size-8"
  if (!logo || failed) return <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[#bcbcbc]", box, small ? "text-[8px]" : "text-[12px]")}>{fallback}</span>
  return <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-md bg-white/[0.06]", box, small ? "p-0.5" : "p-1.5")}><img src={logo.src} alt="" onError={() => setFailed(true)} className={cn("size-full object-contain", logo.monochrome && "brightness-0 invert opacity-80")} /></span>
}
