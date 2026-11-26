"use client"

import { useEffect, useState } from "react"
import { AudioLines, X } from "lucide-react"

type IslandTurn = { role: "user" | "assistant"; content: string; at: number }
type IslandLink = { id: string; status: "waiting" | "live" | "closed"; code?: string; turns: IslandTurn[]; cursor: number }

/**
 * Connects the Jarvis dynamic island to this Nova tab. Nova opens a voice
 * link on the CLI server and shows a code; the island joins with it. Spoken
 * turns then appear here, and the island keeps its own Sarvam speech.
 */
export function IslandLinkButton() {
  const [link, setLink] = useState<IslandLink | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!link || link.status === "closed") return
    let cursor = link.cursor
    let stopped = false
    const poll = async () => {
      while (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        if (stopped) return
        try {
          const next = await request<IslandLink>(`/api/nova/voice/link?id=${link.id}&since=${cursor}`)
          cursor = next.cursor
          if (!stopped) setLink((current) => current && current.id === link.id ? { ...next, turns: [...current.turns, ...next.turns].slice(-6) } : current)
          if (next.status === "closed") return
        } catch {
          // A dropped poll retries on the next tick; the link stays open.
        }
      }
    }
    void poll()
    return () => { stopped = true }
  }, [link?.id])

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      setLink(await request<IslandLink>("/api/nova/voice/link", { method: "POST" }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the voice link")
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    const id = link?.id
    setLink(null)
    if (id) await request(`/api/nova/voice/link?id=${id}`, { method: "DELETE" }).catch(() => null)
  }

  if (!link) {
    return (
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        title={error ?? "Connect the Jarvis dynamic island"}
        className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium text-[#c4c4c4] transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
      >
        <AudioLines className="size-3.5" />
        {busy ? "Connecting…" : "Connect island"}
      </button>
    )
  }

  return (
    <div className="rounded-lg bg-white/[0.04] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <AudioLines className="size-3.5 text-[#c4c4c4]" />
        <span className="text-[12px] text-[#c4c4c4]">{link.status === "live" ? "Island connected" : "Waiting for island"}</span>
        <button type="button" onClick={disconnect} aria-label="Disconnect island" className="ml-auto text-[#8a8a8a] hover:text-white">
          <X className="size-3.5" />
        </button>
      </div>
      {link.status === "waiting" && link.code && (
        <p className="mt-1 font-mono text-[15px] tracking-[0.3em] text-white">{link.code}</p>
      )}
      {link.turns.slice(-2).map((turn, index) => (
        <p key={`${turn.at}-${index}`} className="mt-1 truncate text-[11px] text-[#8a8a8a]">
          {turn.role === "user" ? "You" : "Jarvis"}: {turn.content}
        </p>
      ))}
      {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}
    </div>
  )
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Voice link failed")
  return body as T
}
