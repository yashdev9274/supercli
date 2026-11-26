import prisma from "@super/db"
import { auth } from "@super/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { terminalHarnessUrl } from "@/modules/nova/harness/client"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { createAgentSession } from "@/modules/nova/sessions/service"
import { runWebTurn, type TurnStreamEvent } from "@/modules/nova/sessions/turn"
import { spokenSummary } from "@/modules/nova/sessions/voice-summary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

const turnSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  sessionId: z.string().trim().min(1).max(64).optional(),
}).strict()

/**
 * Runs one spoken request as a Nova web thread and returns a short summary
 * for the dynamic island to speak. The browser does not need to be open:
 * the island calls this with the CLI session token it got from device login,
 * and the thread shows up in Nova whenever the user opens it.
 */
export async function POST(request: NextRequest) {
  const token = bearer(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const caller = await resolveCaller(request, token)
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = turnSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Say that again" }, { status: 400 })

  let harnessToken = caller.harnessToken
  if (!harnessToken) {
    try {
      harnessToken = (await ensureHarnessToken({
        email: caller.email,
        name: caller.name,
        image: caller.image,
        background: true,
      })).token
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Nova could not authorize the harness" },
        { status: 502 },
      )
    }
  }

  let sessionId = parsed.data.sessionId
  if (!sessionId) {
    const created = await createAgentSession({
      userId: caller.id,
      objective: parsed.data.content,
      mode: "agent",
      surface: "web",
    })
    sessionId = created.id
  }

  const events: TurnStreamEvent[] = []
  try {
    for await (const event of runWebTurn({
      userId: caller.id,
      sessionId,
      content: parsed.data.content,
      mode: "agent",
      harnessToken,
      signal: request.signal,
    })) {
      events.push(event)
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nova could not run that", sessionId },
      { status: 502 },
    )
  }

  const failure = events.find((event) => event.type === "error")
  if (failure && failure.type === "error") {
    return NextResponse.json({ error: failure.message, sessionId }, { status: 502 })
  }

  const answer = events
    .filter((event): event is Extract<TurnStreamEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.content)
    .join("")
    .trim()

  return NextResponse.json({
    sessionId,
    summary: spokenSummary(answer),
  })
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null
}

type Caller = {
  id: string
  email: string
  name: string | null
  image: string | null
  harnessToken: string | null
}

async function resolveCaller(request: NextRequest, token: string): Promise<Caller | null> {
  const web = await auth.api.getSession({ headers: request.headers })
  if (web?.user?.id && web.user.email) {
    return {
      id: web.user.id,
      email: web.user.email,
      name: web.user.name,
      image: web.user.image,
      harnessToken: null,
    }
  }

  const response = await fetch(`${terminalHarnessUrl()}/api/user/me`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null)
  if (!response?.ok) return null
  const terminal = await response.json().catch(() => null) as { email?: string; name?: string; image?: string | null } | null
  const email = terminal?.email?.trim().toLowerCase()
  if (!email) return null

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, image: true },
  })
  const user = existing ?? await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      name: terminal?.name?.trim() || email.split("@")[0] || "Nova user",
      emailVerified: true,
      image: terminal?.image ?? null,
    },
    select: { id: true, email: true, name: true, image: true },
  })
  return { ...user, harnessToken: token }
}
