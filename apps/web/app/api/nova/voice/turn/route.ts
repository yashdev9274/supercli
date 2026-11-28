import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { codexEffortSchema } from "@/modules/nova/codex/models"
import { createAgentSession } from "@/modules/nova/sessions/service"
import { runWebTurn } from "@/modules/nova/sessions/turn"
import { spokenSummary } from "@/modules/nova/sessions/voice-summary"
import { resolveNovaTurnMode } from "@/modules/nova-web/resolve-mode"
import { resolveVoiceCaller } from "@/modules/nova/voice/auth"
import { prepareVoiceProvider, voiceProviderFailure } from "@/modules/nova/voice/providers"
import { MAX_LOCAL_BASE64_CHARS, MAX_LOCAL_FILE_BYTES } from "@/modules/nova/attachments/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

const turnSchema = z.object({
  content: z.string().trim().min(1).max(4_000),
  sessionId: z.string().trim().min(1).max(64).optional(),
  provider: z.string().trim().min(1).max(64).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  effort: codexEffortSchema.optional(),
  screenImage: z.string().max(MAX_LOCAL_BASE64_CHARS + 23).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
  screenSelection: z.literal("true").optional(),
}).strict()

/**
 * Runs one spoken request as a Nova web thread and returns a short summary
 * for the dynamic island to speak. The browser does not need to be open:
 * the island calls this with the CLI session token it got from device login,
 * and the thread shows up in Nova whenever the user opens it.
 */
export async function POST(request: NextRequest) {
  try { return await runVoiceRequest(request) }
  catch (error) {
    const safe = voiceProviderFailure(error)
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
}

async function runVoiceRequest(request: NextRequest) {
  const caller = await resolveVoiceCaller(request)
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = turnSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Say that again" }, { status: 400 })
  const imageData = parsed.data.screenImage?.slice("data:image/jpeg;base64,".length)
  const imageSize = imageData ? Buffer.from(imageData, "base64").length : 0
  if (imageSize > MAX_LOCAL_FILE_BYTES) return NextResponse.json({ error: "Screen capture is too large" }, { status: 400 })
  const mode = resolveNovaTurnMode({ message: parsed.data.content }).mode
  const selection = await prepareVoiceProvider(caller, parsed.data, request.signal)

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
      localAttachments: imageData ? [{
        id: crypto.randomUUID(), kind: "image", name: parsed.data.screenSelection ? "screen-selection.jpg" : "screen.jpg",
        mediaType: "image/jpeg", size: imageSize, dataBase64: imageData,
      }] : [],
      mode,
      ...selection,
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
