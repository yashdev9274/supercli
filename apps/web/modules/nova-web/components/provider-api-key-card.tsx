"use client"

import { useEffect, useState } from "react"
import type { HarnessProvider } from "@/modules/nova-web/models"

const SUPPORTED = new Set<HarnessProvider>(["cursor", "opencode"])

export function ProviderApiKeyCard({ provider }: { provider: HarnessProvider }) {
  const [connected, setConnected] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    if (!SUPPORTED.has(provider)) return
    void fetch(`/api/nova/providers/${provider}/connection`, { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setConnected(body.connected === true))
      .catch(() => {})
  }, [provider])
  if (!SUPPORTED.has(provider)) return null
  async function save() {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(`/api/nova/providers/${provider}/connection`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) })
      const body = await response.json()
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not connect provider")
      setConnected(true); setApiKey(""); setMessage(`Connected. ${Array.isArray(body.models) ? body.models.length : 0} models available.`)
      window.dispatchEvent(new Event("nova:provider-connection"))
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not connect provider") }
    finally { setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setMessage(null)
    try { await fetch(`/api/nova/providers/${provider}/connection`, { method: "DELETE", credentials: "same-origin" }); setConnected(false); setMessage("Disconnected."); window.dispatchEvent(new Event("nova:provider-connection")) }
    finally { setBusy(false) }
  }
  const label = provider === "cursor" ? "Cursor Cloud Agents" : "OpenCode Go"
  return <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-medium text-white">{label}</p><p className="mt-1 text-xs text-[#888]">{connected ? "Connected. The key is encrypted on Nova’s backend." : "Connect with your provider API key."}</p></div>
      {connected ? <button type="button" onClick={() => void disconnect()} disabled={busy} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#aaa] hover:bg-white/5 disabled:opacity-50">Disconnect</button> : null}
    </div>
    {!connected ? <div className="mt-3 flex gap-2"><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={`${label} API key`} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-[#2dd4bf]/60" /><button type="button" onClick={() => void save()} disabled={busy || !apiKey.trim()} className="rounded-lg bg-[#2dd4bf] px-3 py-2 text-xs font-medium text-black disabled:opacity-40">{busy ? "Checking…" : "Connect"}</button></div> : null}
    {message ? <p className="mt-2 text-xs text-[#aaa]" role="status">{message}</p> : null}
  </div>
}
