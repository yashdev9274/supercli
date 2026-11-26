/**
 * Shared voice link between the Jarvis dynamic island and Nova web.
 *
 * Nova web opens a link and shows a one-time code. The island joins with that
 * code. Both sides poll the same link, so a turn spoken on the island shows up
 * in Nova, and a note typed in Nova shows up on the island. Speech itself stays
 * on the island (Sarvam today); this channel only carries text and presence.
 */

import { randomInt, randomUUID } from "crypto"

export type IslandLinkStatus = "waiting" | "live" | "closed"

export interface IslandTurn {
  role: "user" | "assistant"
  content: string
  at: number
}

export interface IslandLinkView {
  id: string
  status: IslandLinkStatus
  /** Present only for the Nova tab that opened the link. */
  code?: string
  turns: IslandTurn[]
  cursor: number
}

interface IslandLink {
  id: string
  userId: string
  code: string
  status: IslandLinkStatus
  turns: IslandTurn[]
  createdAt: number
  expiresAt: number
  lastSeenAt: number
}

const CODE_TTL_MS = 10 * 60 * 1000
const LIVE_TTL_MS = 60 * 60 * 1000
const MAX_TURNS = 40
const MAX_CONTENT = 4_000

const links = new Map<string, IslandLink>()

function purge(now = Date.now()): void {
  for (const [id, link] of links) {
    if (link.expiresAt <= now || link.status === "closed") links.delete(id)
  }
}

function mintCode(): string {
  // Unambiguous: no 0/O or 1/I, so it can be read out loud.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let code = ""
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)]
  return code
}

export function openIslandLink(userId: string): IslandLinkView {
  purge()
  for (const link of links.values()) {
    if (link.userId === userId) link.status = "closed"
  }
  const now = Date.now()
  const link: IslandLink = {
    id: randomUUID(),
    userId,
    code: mintCode(),
    status: "waiting",
    turns: [],
    createdAt: now,
    expiresAt: now + CODE_TTL_MS,
    lastSeenAt: now,
  }
  links.set(link.id, link)
  return view(link, true, 0)
}

export function readIslandLink(userId: string, id: string, since = 0): IslandLinkView | null {
  purge()
  const link = links.get(id)
  if (!link || link.userId !== userId || link.status === "closed") return null
  link.lastSeenAt = Date.now()
  return view(link, true, since)
}

export function closeIslandLink(userId: string, id: string): boolean {
  const link = links.get(id)
  if (!link || link.userId !== userId) return false
  links.delete(id)
  return true
}

export interface IslandJoin {
  linkId: string
  status: IslandLinkStatus
  turns: IslandTurn[]
}

/** Join by code. Returns null when the code is unknown, expired, or taken. */
export function joinIslandLink(userId: string, code: string): IslandJoin | null {
  purge()
  const normalized = code.trim().toUpperCase()
  const link = [...links.values()].find((item) => item.userId === userId && item.code === normalized)
  if (!link || link.status !== "waiting") return null
  link.status = "live"
  link.expiresAt = Date.now() + LIVE_TTL_MS
  return { linkId: link.id, status: link.status, turns: link.turns.slice() }
}

export function touchIslandLink(userId: string, id: string, since = 0): IslandLinkView | null {
  purge()
  const link = links.get(id)
  if (!link || link.userId !== userId || link.status !== "live") return null
  link.lastSeenAt = Date.now()
  link.expiresAt = Date.now() + LIVE_TTL_MS
  return view(link, false, since)
}

export type IslandPostResult =
  | { ok: true; cursor: number }
  | { ok: false; reason: "missing" | "not-live" }

/** Append a turn. `source` says who is posting, so a side never echoes itself. */
export function postIslandTurn(
  userId: string,
  id: string,
  role: IslandTurn["role"],
  content: string,
): IslandPostResult {
  const link = links.get(id)
  if (!link || link.userId !== userId || link.status === "closed") return { ok: false, reason: "missing" }
  if (link.status !== "live") return { ok: false, reason: "not-live" }
  const text = content.trim().slice(0, MAX_CONTENT)
  if (!text) return { ok: true, cursor: link.turns.length }
  link.turns.push({ role, content: text, at: Date.now() })
  if (link.turns.length > MAX_TURNS) link.turns.splice(0, link.turns.length - MAX_TURNS)
  link.lastSeenAt = Date.now()
  link.expiresAt = Date.now() + LIVE_TTL_MS
  return { ok: true, cursor: link.turns.length }
}

function view(link: IslandLink, withCode: boolean, since: number): IslandLinkView {
  const cursor = Math.max(0, Math.min(since, link.turns.length))
  return {
    id: link.id,
    status: link.status,
    ...(withCode ? { code: link.code } : {}),
    turns: link.turns.slice(cursor),
    cursor: link.turns.length,
  }
}

/** Test-only: drop every link so cases do not leak into each other. */
export function resetIslandLinks(): void {
  links.clear()
}
