import { auth } from "@super/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

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

  const session = await auth.api.getSession({ headers: new Headers({ Authorization: `Bearer ${token}` }) })
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = turnSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Say that again" }, { status: 400 })

  let harness
  try {
    harness = await ensureHarnessToken({
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      background: true,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nova could not authorize the harness" },
      { status: 502 },
    )
  }

  let sessionId = parsed.data.sessionId
  if (!sessionId) {
    const created = await createAgentSession({
      userId: session.user.id,
      objective: parsed.data.content,
      mode: "agent",
      surface: "web",
    })
    sessionId = created.id
  }

  const events: TurnStreamEvent[] = []
  try {
    for await (const event of runWebTurn({
      userId: session.user.id,
      sessionId,
      content: parsed.data.content,
      mode: "agent",
      harnessToken: harness.token,
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
