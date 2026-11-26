import prisma from "@super/db"
import { auth } from "@super/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { terminalHarnessUrl } from "@/modules/nova/harness/client"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { createAgentSession } from "@/modules/nova/sessions/service"
import { runWebTurn } from "@/modules/nova/sessions/turn"
import { spokenSummary } from "@/modules/nova/sessions/voice-summary"
import { resolveNovaTurnMode } from "@/modules/nova-web/resolve-mode"

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
  const mode = resolveNovaTurnMode({ message: parsed.data.content }).mode

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
      mode,
      surface: "web",
    })
    sessionId = created.id
  }

  let answer = ""
  let failure: string | undefined
  let finishReason: string | undefined
  try {
    for await (const event of runWebTurn({
      userId: caller.id,
      sessionId,
      content: parsed.data.content,
      mode,
      effort: "low",
      responseStyle: "voice",
      harnessToken,
      signal: request.signal,
    })) {
      if (event.type === "text") answer += event.content
      else if (event.type === "error") failure = event.message
      else if (event.type === "finish") finishReason = event.reason
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nova could not run that", sessionId },
      { status: 502 },
    )
  }

  if (failure) {
    return NextResponse.json({ error: failure, sessionId }, { status: 502 })
  }
  if (finishReason === "awaiting_input") {
    return NextResponse.json({ sessionId, summary: "I need your answer or approval before continuing. Please open this thread in Nova." })
  }
  if (finishReason !== "stop" || !answer.trim()) {
    return NextResponse.json({ error: "Nova did not produce an answer. Please try again in this thread.", sessionId }, { status: 502 })
  }

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
      image: web.user.image ?? null,
      harnessToken: null,
    }
  }

  const response = await fetch(`${terminalHarnessUrl()}/api/voice/identity`, {
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
