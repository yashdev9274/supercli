"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { isLocalNova, LocalCodexClient, type LocalCodexStatus } from "@/modules/nova-web/codex-local"

type Message = { role: "user" | "assistant"; content: string }
const buttonClass = "rounded-lg border border-white/10 px-3 py-2 text-[12px] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"

const subscribeOrigin = () => () => {}
const browserOrigin = () => window.location.origin
const serverOrigin = () => null

export function ChatGPTConnectionCard() {
  const origin = useSyncExternalStore(subscribeOrigin, browserOrigin, serverOrigin)
  const [port, setPort] = useState("43127")
  const [code, setCode] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [client, setClient] = useState<LocalCodexClient | null>(null)
  const [status, setStatus] = useState<LocalCodexStatus | null>(null)
  const [models, setModels] = useState<Array<{ id: string; label: string }>>([])
  const [model, setModel] = useState("")
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [openChat, setOpenChat] = useState(false)
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const thread = useRef<string | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const clientRef = useRef<LocalCodexClient | null>(null)

  useEffect(() => {
    return () => {
      abort.current?.abort()
      const current = clientRef.current
      if (current) void current.unpair().catch(() => undefined)
    }
  }, [])

  async function refresh(current = client) {
    if (!current) return
    const next = await current.status()
    if (status?.account && JSON.stringify(status.account) !== JSON.stringify(next.account)) {
      thread.current = undefined
      setMessages([])
    }
    setStatus(next)
    if (next.account) {
      const catalog = await current.models()
      setModels(catalog)
      setModel((selected) => catalog.some((entry) => entry.id === selected) ? selected : catalog[0]?.id ?? "")
      if (next.login !== "pending") setAuthUrl(null)
    } else {
      setModels([])
      setModel("")
      thread.current = undefined
      setMessages([])
    }
    if (next.login === "failed") setError("Codex sign-in failed. Cancel and try again.")
  }

  async function action(operation: () => Promise<void>) {
    if (busy || streaming) return
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Local Codex request failed") }
    finally { setBusy(false) }
  }

  async function pair() {
    if (!origin || !confirmed) return
    const next = new LocalCodexClient(Number(port), origin)
    await next.pair(code)
    setCode("")
    clientRef.current = next
    setClient(next)
    await refresh(next)
  }

  async function unpair() {
    if (!client) return
    try { await client.unpair() }
    finally {
      clientRef.current = null
      setClient(null)
      setStatus(null)
      setAuthUrl(null)
      setModels([])
      setMessages([])
      thread.current = undefined
      setOpenChat(false)
    }
  }

  async function send() {
    if (!client || streaming || busy || !draft.trim() || !model) return
    const content = draft.trim()
    const controller = new AbortController()
    abort.current = controller
    setStreaming(true)
    setError(null)
    setDraft("")
    setMessages((current) => [...current, { role: "user", content }, { role: "assistant", content: "" }])
    try {
      for await (const event of client.turn({ content, model, thread: thread.current }, controller.signal)) {
        if (event.type === "thread") thread.current = event.id
        if (event.type === "text") setMessages((current) => current.map((item, index) => index === current.length - 1 ? { ...item, content: item.content + event.content } : item))
        if (event.type === "finish" && event.reason !== "completed") setError(`Codex turn ${event.reason}. The answer may be incomplete.`)
      }
    } catch (failure) {
      setError(controller.signal.aborted ? "Turn cancelled. Restart and re-pair if the companion stopped." : failure instanceof Error ? failure.message : "Codex turn failed")
    } finally {
      abort.current = null
      setStreaming(false)
    }
  }

  return (
    <section aria-labelledby="chatgpt-plan-heading" className="mt-8 rounded-xl border border-white/[0.08] bg-[#171717] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="chatgpt-plan-heading" className="text-[13px] font-medium">ChatGPT plan · Local Codex</h2>
        <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-[#a0a0a0]">Read-only preview</span>
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#a0a0a0]">Use your existing local Codex login and ChatGPT plan. Codex manages credentials and renewal on your machine; Nova never reads or copies your auth files. Plan limits and model access depend on your account.</p>
      {!origin || !isLocalNova(origin) ? (
        <p className="mt-3 text-[12px] text-[#8a8a8a]">The local companion is available only in locally hosted Nova. For a backend-held login without a companion, use Connect Codex above.</p>
      ) : !client ? (
        <div className="mt-4 space-y-3 text-[12px]">
          <p>Install the Codex CLI and run <code>codex login</code> if needed, then run this in your workspace:</p>
          <code className="block overflow-x-auto rounded bg-black/20 p-2">supercode nova connect --origin {origin}</code>
          <p className="text-[#8a8a8a]">Uses CODEX_HOME or ~/.codex by default. For a separate Nova account, add <code>--profile isolated</code>. Restart the companion to get a fresh code after a reload or disconnect. Pairing expires after one hour.</p>
          <div className="flex flex-wrap gap-2">
            <label>Port<input aria-label="Companion port" type="number" min={1024} max={65535} value={port} onChange={(event) => setPort(event.target.value)} className="ml-2 w-24 rounded border border-white/10 bg-black/20 p-2" /></label>
            <label>Pairing code<input aria-label="Pairing code" type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} className="ml-2 rounded border border-white/10 bg-black/20 p-2" /></label>
          </div>
          <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Allow this Nova tab to control local Codex and read the companion’s selected workspace.</label>
          <button type="button" disabled={busy || !confirmed || !code} onClick={() => void action(pair)} className={buttonClass}>Detect & pair local Codex</button>
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-[12px]">
          <p>Workspace: {status?.workspace ?? "Checking…"} · {status?.account ? `${status.account.email ?? "ChatGPT account"} · ${status.account.planType}` : "Not signed in"}</p>
          {status?.profile === "existing" ? <p className="text-[#8a8a8a]">Using your existing Codex profile. Nova cannot change or sign out this account. To sign in or switch accounts, run <code>codex login</code> in a terminal with the same CODEX_HOME, then restart the companion and pair again. Unpair only disconnects this tab.</p> : null}
          <div className="flex flex-wrap gap-2">
            {status?.profile === "isolated" && !status.account ? <button type="button" disabled={busy || streaming || status.login === "pending"} onClick={() => void action(async () => { setAuthUrl(await client.login()); await refresh() })} className={buttonClass}>Continue with ChatGPT</button> : null}
            <button type="button" disabled={busy || streaming} onClick={() => void action(async () => { await refresh() })} className={buttonClass}>Refresh account & models</button>
            {status?.login === "pending" ? <button type="button" disabled={busy || streaming} onClick={() => void action(async () => { await client.cancelLogin(); setAuthUrl(null); await refresh() })} className={buttonClass}>Cancel sign-in</button> : null}
            {status?.profile === "isolated" && status.account ? <button type="button" disabled={busy || streaming} onClick={() => void action(async () => { await client.logout(); setMessages([]); thread.current = undefined; await refresh() })} className={buttonClass}>Sign out of Nova Codex</button> : null}
            <button type="button" disabled={busy || streaming} onClick={() => void action(unpair)} className={buttonClass}>Unpair</button>
          </div>
          {authUrl ? <p><a href={authUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-[#2dd4bf] underline">Open ChatGPT sign-in</a>. After completing it, refresh the account above.</p> : null}
          {status?.account ? (
            <div>
              <label>Codex model<select aria-label="Local Codex model" value={model} disabled={busy || streaming} onChange={(event) => setModel(event.target.value)} className="ml-2 max-w-full rounded border border-white/10 bg-[#171717] p-2">{models.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
              <p className="mt-2 text-[#8a8a8a]">Catalog entries do not guarantee access; a completed turn verifies model access for that request.</p>
              <button type="button" onClick={() => setOpenChat((current) => !current)} className={`${buttonClass} mt-3`}>{openChat ? "Hide local chat" : "Open local Codex chat"}</button>
            </div>
          ) : null}
          {openChat && status?.account ? (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <p className="text-[#8a8a8a]">Local read-only chat/planning. Prompts go directly to the companion, not hosted Nova sessions. Read-only does not limit reads to this folder; do not use it for sensitive workspaces. Writable tools and Nova cloud integrations are unavailable.</p>
              <div role="log" aria-label="Local Codex messages" className="max-h-96 space-y-3 overflow-auto">{messages.map((item, index) => <div key={index} className="whitespace-pre-wrap break-words rounded bg-black/20 p-3"><strong>{item.role === "user" ? "You" : "Codex"}</strong><p className="mt-1">{item.content}</p></div>)}</div>
              <textarea aria-label="Message local Codex" maxLength={32_000} value={draft} disabled={streaming || busy} onChange={(event) => setDraft(event.target.value)} placeholder="Ask Codex about this workspace…" className="min-h-24 w-full rounded border border-white/10 bg-black/20 p-3" />
              <div className="flex gap-2"><button type="button" disabled={streaming || busy || !draft.trim() || !model} onClick={() => void send()} className={buttonClass}>Send to local Codex</button><button type="button" disabled={!streaming} onClick={() => { void client.interrupt().catch(() => abort.current?.abort()) }} className={buttonClass}>Stop</button><button type="button" disabled={streaming} onClick={() => { thread.current = undefined; setMessages([]) }} className={buttonClass}>New local chat</button></div>
            </div>
          ) : null}
        </div>
      )}
      {busy ? <p role="status" className="mt-3 text-[12px] text-[#8a8a8a]">Contacting local Codex…</p> : null}
      {error ? <p role="alert" className="mt-3 text-[12px] text-red-300">{error}</p> : null}
    </section>
  )
}
