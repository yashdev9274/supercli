"use client"

import { useEffect, useRef, useState } from "react"

import { Copy, ExternalLink, Loader2, Plus } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { CodexView } from "@/modules/nova/codex/service"

const ENDPOINT = "/api/nova/codex/connection"
const ACTIVE = ["starting", "pending", "polling"]
const buttonClass = "rounded-lg border border-white/10 px-3 py-2 text-[12px] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"

async function connectionRequest(action?: { action: string; attemptId?: string }, signal?: AbortSignal): Promise<CodexView> {
  const response = await fetch(ENDPOINT, {
    method: action ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: action ? { "Content-Type": "application/json" } : undefined,
    body: action ? JSON.stringify(action) : undefined,
    signal,
  })
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not update Codex connection")
  return body as CodexView
}

export function CodexDeviceConnectionCard() {
  const [view, setView] = useState<CodexView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const generation = useRef(0)
  const busyRef = useRef(false)
  const request = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const epoch = generation.current
    void connectionRequest(undefined, controller.signal).then((result) => {
      if (generation.current === epoch) setView(result)
    }).catch((failure) => {
      if (!controller.signal.aborted && generation.current === epoch) setError(failure instanceof Error ? failure.message : "Could not load your Codex connection.")
    })
    return () => { controller.abort(); request.current?.abort() }
  }, [])

  useEffect(() => {
    if (!open || busy || !view || !ACTIVE.includes(view.state) || !view.attemptId) return
    const epoch = generation.current
    const controller = new AbortController()
    const attemptId = view.attemptId
    const expiryDelay = view.expiresAt ? Math.max(1000, Date.parse(view.expiresAt) - Date.now()) : Infinity
    const delay = Math.min(expiryDelay, Math.max(1, view.retryAfterSeconds ?? 5) * 1000)
    const timer = setTimeout(() => {
      void connectionRequest({ action: "poll", attemptId }, controller.signal).then((result) => {
        if (generation.current !== epoch) return
        setView(result)
        if (result.state === "connected") window.dispatchEvent(new Event("nova:codex-connection"))
        setError(null)
      }).catch(() => {
        if (controller.signal.aborted || generation.current !== epoch) return
        setError("Could not check Codex authorization. Refresh status before retrying.")
        setOpen(false)
      })
    }, delay)
    return () => { clearTimeout(timer); controller.abort() }
  }, [open, busy, view])

  async function act(action?: { action: string; attemptId?: string }) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setCopied(false)
    if (action?.action === "start") setOpen(true)
    const epoch = ++generation.current
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await connectionRequest(action, controller.signal)
      if (generation.current !== epoch) return
      setView(result)
      window.dispatchEvent(new Event("nova:codex-connection"))
      if (action?.action === "start") setOpen(true)
      if (action?.action === "cancel" || action?.action === "disconnect") setOpen(false)
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Codex connection failed")
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch { setError("Could not copy. Select and copy the code manually.") }
  }

  const active = !!view && ACTIVE.includes(view.state)
  const connected = view?.state === "connected"
  return (
    <section aria-labelledby="codex-device-heading" className="mt-10">
      <h2 id="codex-device-heading" className="text-[13px] font-medium">Your connections</h2>
      <p className="mt-2 text-[12px] text-[#8a8a8a]">Connect your own subscriptions to model providers.</p>
      <div className="mt-3 flex min-h-16 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#222222] px-4 py-3">
        <div role="status" className="min-w-0 text-[13px]">
          {connected || active ? <div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-white/5 font-mono text-[#a0a0a0]">C</span><div>Codex<p className="mt-0.5 text-[12px] text-[#8a8a8a]">{connected ? "Connection saved · model access checked separately" : "Waiting for authorization"}</p></div></div> : !view && !error ? "Loading connections…" : !view ? "Connections unavailable" : "No connections"}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected || active ? <>
            {active && view?.attemptId ? <button type="button" disabled={busy} className={buttonClass} onClick={() => setOpen(true)}>Resume</button> : null}
            <button type="button" disabled={busy} className={buttonClass} onClick={() => void act({ action: "disconnect" })}>{connected ? "Disconnect" : "Cancel"}</button>
          </> : <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Connect provider" disabled={busy} className="flex size-7 items-center justify-center rounded-md bg-white/[0.06] text-[#a0a0a0] hover:bg-white/10 disabled:opacity-40"><Plus className="size-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 border-white/10 bg-[#292929] p-1.5 text-[#ededed]">
              <DropdownMenuLabel className="text-[12px] font-normal text-[#8a8a8a]">Subscriptions</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void act({ action: "start" })} className="cursor-pointer text-[13px] focus:bg-white/5 focus:text-white"><span aria-hidden="true" className="flex size-4 items-center justify-center font-mono text-[#999]">C</span>Codex</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#8a8a8a]">Choose OpenAI Codex in the chat model picker to use your subscription. Models and reasoning levels depend on your account. Credentials stay encrypted on Nova’s backend. Disconnect removes Nova’s credentials, not other OpenAI sessions.</p>
      {view?.state === "expired" || view?.state === "failed" ? <p role="status" className="mt-2 text-[12px] text-[#a0a0a0]">{view.state === "expired" ? "The code expired." : "Authorization failed."} Start a new connection using +.</p> : null}
      {error ? <div className="mt-2 flex flex-wrap items-center gap-3"><p role="alert" className="text-[12px] text-red-300">{error}</p><button type="button" disabled={busy} onClick={() => void act()} className="text-[12px] text-[#a0a0a0] underline">Retry</button></div> : null}
      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
        <DialogContent className="gap-3 rounded-xl border-white/15 bg-[#292929] p-5 text-[#ededed] sm:max-w-[448px]">
          <DialogTitle className="text-[14px] font-medium">Connect Codex</DialogTitle>
          <DialogDescription className="text-[13px] text-[#999]">Use your own subscription for this provider’s models.</DialogDescription>
          {connected ? <p role="status" className="text-sm">Codex connected. Your credentials were saved securely.</p> : active && view?.userCode ? <>
            <ol className="list-decimal space-y-3 pl-6 text-[13px] leading-[17px] marker:text-[#888]">
              <li>In ChatGPT Settings → Security, turn on device code authorization for Codex.
                <p className="mt-1 text-[#888]">If your workspace hides the switch, ask your workspace owner to enable device code authentication for Codex CLI.</p>
              </li>
              <li>Copy this code
                <button type="button" aria-label="Copy device code" disabled={busy} className="mt-2 flex items-center gap-3 rounded-md border border-white/15 bg-black/10 px-2.5 py-1.5 hover:bg-white/5" onClick={() => void copy(view.userCode!)}><code className="select-all font-mono tracking-wider">{view.userCode}</code><Copy className="size-3.5 text-[#aaa]" /></button>
              </li>
              <li>Sign in to ChatGPT, select your workspace if prompted, and enter the code.
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href="https://auth.openai.com/codex/device" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="flex items-center gap-2 rounded-md border border-white/15 px-2.5 py-1.5 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-[#f97316]">Verification page <ExternalLink className="size-3.5" /></a>
                  <button type="button" className="flex items-center gap-2 rounded-md border border-white/15 px-2.5 py-1.5 hover:bg-white/5" onClick={() => void copy("https://auth.openai.com/codex/device")}><Copy className="size-3.5" />Copy link</button>
                </div>
              </li>
            </ol>
            <div className="flex items-start gap-2 text-[13px]"><Loader2 aria-hidden="true" className="mt-0.5 size-3.5 animate-spin text-[#888]" /><div><p role="status">Waiting for Codex</p><p className="mt-1 text-[#888]">Only continue if you started this login in Nova.</p></div></div>
            <p className="pl-6 text-[11px] text-[#888]">Expires at {view.expiresAt ? new Date(view.expiresAt).toLocaleTimeString() : "15 minutes"}. Nova stores this login encrypted on its backend.</p>
          </> : busy ? <p role="status" className="flex items-center gap-2 py-4 text-[13px] text-[#aaa]"><Loader2 className="size-4 animate-spin" />Preparing device authorization…</p> : <p role="status" className="text-[13px] text-[#aaa]">{active ? "Preparing device authorization…" : error ? "Could not start the connection." : "Authorization ended. Start a new connection to retry."}</p>}
          {copied ? <p role="status" className="text-xs text-[#aaa]">Copied to clipboard</p> : null}
          {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
          <div className="mt-2 flex items-center justify-between text-[12px]">
            <a href="https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-[#f97316] hover:underline">OpenAI sign-in help ↗</a>
            <button type="button" disabled={busy} className="px-2 py-1 text-[#aaa] hover:text-white disabled:opacity-40" onClick={() => active && view?.attemptId ? void act({ action: "cancel", attemptId: view.attemptId }) : setOpen(false)}>{active ? "Cancel" : "Close"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
