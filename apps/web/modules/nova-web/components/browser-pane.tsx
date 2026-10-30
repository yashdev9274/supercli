"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Globe, Hand, Loader2, Play, RefreshCw, Square } from "lucide-react"

import { browserLiveViewUrl } from "@/modules/nova-web/browser-view"
import { readBrowserResponse } from "@/modules/nova-web/browser-response"
import { useVisiblePolling } from "@/modules/nova-web/use-visible-polling"

type BrowserState = {
  configured: boolean
  browser: null | {
    id: string
    status: string
    control: "user" | "agent"
    expiresAt: string
    liveViewUrl?: string
    connectionError?: string
    busy: boolean
  }
}

const buttonClass = "inline-flex items-center justify-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-[#c0c0c0] hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"

export function BrowserPane({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<BrowserState | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnected, setDisconnected] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const endpoint = `/api/nova/sessions/${encodeURIComponent(sessionId)}/browser`

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const request = useCallback(async (method = "GET", control?: "user" | "agent", reconnect = false) => {
    if (inFlight.current) return
    inFlight.current = true
    if (method !== "GET") {
      setPending(true)
      // Remove the interactive surface before changing ownership.
      setState((current) => current ? { ...current, browser: current.browser ? { ...current.browser, liveViewUrl: undefined } : null } : null)
    }
    try {
      const response = await fetch(endpoint, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        ...(control ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ control }) } : {}),
      })
      const data = await readBrowserResponse(response)
      if (!mounted.current) return
      const next = data as BrowserState
      setState((current) => {
        if (method === "GET" && !reconnect && current?.browser?.liveViewUrl && next.browser?.liveViewUrl && current.browser.id === next.browser.id && next.browser.control === "user" && !next.browser.busy) {
          return { ...next, browser: { ...next.browser, liveViewUrl: current.browser.liveViewUrl } }
        }
        return next
      })
      if (method !== "GET" || reconnect) setDisconnected(false)
      setError(null)
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : "Could not connect to the browser")
        setState((current) => current ? { ...current, browser: current.browser ? { ...current.browser, liveViewUrl: undefined } : null } : null)
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setPending(false)
    }
  }, [endpoint])

  const refresh = useCallback(() => request(), [request])
  useVisiblePolling(refresh, state?.browser ? 20_000 : 60_000, true)
  const browser = state?.browser
  const liveUrl = browser?.control === "user" && !browser.busy && !disconnected ? browserLiveViewUrl(browser.liveViewUrl) : null
  const active = browser && !["ended", "failed", "expired"].includes(browser.status)

  useEffect(() => {
    if (!liveUrl) return
    const origin = new URL(liveUrl).origin
    function onMessage(event: MessageEvent) {
      if (event.origin === origin && event.source === frame.current?.contentWindow && event.data === "browserbase-disconnected") setDisconnected(true)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [liveUrl])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        <span className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-[#555]"}`} />
        <span className="min-w-0 flex-1 text-[11px] text-[#999]">{active ? browser.busy ? "Finishing browser action…" : browser.control === "agent" ? "Nova has control" : "You have control" : "Browserbase"}</span>
        <button type="button" aria-label="Reconnect browser view" disabled={pending} onClick={() => void request("GET", undefined, true)} className={buttonClass}><RefreshCw className="size-3" /></button>
        {active ? (
          <>
            <button type="button" disabled={pending || (browser.control === "user" && browser.busy) || browser.status !== "active"} onClick={() => void request("PATCH", browser.control === "user" ? "agent" : "user")} className={buttonClass}>
              {browser.control === "user" ? <Play className="size-3" /> : <Hand className="size-3" />}{browser.control === "user" ? "Resume agent" : "Take control"}
            </button>
            <button type="button" disabled={pending} onClick={() => void request("DELETE")} className={buttonClass}><Square className="size-3" />Stop</button>
          </>
        ) : null}
      </div>
      {error || browser?.connectionError ? <div role="alert" className="border-b border-amber-400/10 bg-amber-400/[0.04] px-3 py-2 text-xs leading-5 text-amber-200">{error || browser?.connectionError}</div> : null}
      <div className="relative min-h-0 flex-1">
        {liveUrl ? (
          <iframe ref={frame} title="Shared Nova browser" src={liveUrl} sandbox="allow-same-origin allow-scripts" allow="clipboard-read; clipboard-write" referrerPolicy="no-referrer" className="h-full w-full border-0 bg-[#151515]" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 flex size-14 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025]"><Globe className="size-6 text-[#999]" strokeWidth={1.25} /></div>
            <h2 className="text-sm font-medium text-[#ddd]">{pending ? "Connecting…" : active ? browser.control === "agent" ? "Nova’s browser workspace" : "Browser is connecting" : "Browse together"}</h2>
            <p className="mt-2 max-w-64 text-xs leading-5 text-[#999]">
{!state ? error ? "Use reconnect to retry the browser service." : "Checking browser configuration…" : !state.configured ? "Configure BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID on the server to enable the shared browser." : active ? browser.control === "agent" ? "Nova can inspect and navigate this session. Take control to interact, sign in, or complete sensitive actions." : disconnected ? "The live view disconnected. Reconnect or stop this session." : "Waiting for a safe connection. Use reconnect to refresh the view." : "Open an isolated cloud browser, then hand it to Nova when you’re ready. Sessions run for up to 15 minutes."}
            </p>
            {!active && state?.configured ? <button type="button" disabled={pending} onClick={() => void request("POST")} className={`${buttonClass} mt-5 bg-white/[0.06]`}>{pending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}Start browser</button> : null}
            {pending || (!state && !error) ? <Loader2 className="mt-4 size-4 animate-spin text-[#777]" /> : null}
            <p className="mt-5 max-w-64 text-[10px] leading-4 text-[#777]">No shared saved logins. Cloud browsers cannot reach your laptop’s localhost. Browserbase keep-alive requires a paid plan.</p>
          </div>
        )}
      </div>
    </div>
  )
}
