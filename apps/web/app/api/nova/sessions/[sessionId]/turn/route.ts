import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest } from "next/server"
import { z } from "zod"

import { localAttachmentsSchema } from "@/modules/nova/attachments/contracts"
import { CHATGPT_PROVIDER, CHATGPT_HOSTED_STATUS, CHATGPT_UNAVAILABLE_MESSAGE } from "@/modules/nova/chatgpt/contracts"
import { CODEX_PROVIDER, codexEffortSchema } from "@/modules/nova/codex/models"
import { codexPublicError } from "@/modules/nova/codex/errors"
import { assertCodexOrigin } from "@/modules/nova/codex/request"
import { createCodexRuntime } from "@/modules/nova/codex/runtime"
import { codexContextForRequest } from "@/modules/nova/codex/server"
import type { ChatTransport } from "@/modules/nova/harness/agent"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { referencesInputSchema } from "@/modules/nova/references/contracts"
import { runWebTurn } from "@/modules/nova/sessions/turn"
import { machineSizeSchema } from "@/modules/nova/sandbox/machine-sizes"
import { validateMachineSelection } from "@/modules/nova/sandbox/machine-config"

const turnSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  provider: z.string().trim().min(1).max(64).optional(),
  effort: codexEffortSchema.optional(),
  machineSize: machineSizeSchema.optional().default("default"),
  mode: z.enum(["agent", "plan", "chat"]).optional(),
  references: referencesInputSchema,
  localAttachments: localAttachmentsSchema,
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 600

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id || !session.user.email) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const parsed = turnSchema.safeParse(await request.json())
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid turn", issues: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (parsed.data.provider === CHATGPT_PROVIDER) {
    return Response.json(
      { error: CHATGPT_UNAVAILABLE_MESSAGE, code: CHATGPT_HOSTED_STATUS },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }

  try {
    validateMachineSelection(parsed.data.machineSize)
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid machine size" }, { status: 400 })
  }

  const isCodex = parsed.data.provider === CODEX_PROVIDER
  let chatTransport: ChatTransport | undefined
  if (isCodex) {
    try {
      assertCodexOrigin(request)
      const runtime = createCodexRuntime(await codexContextForRequest(request))
      chatTransport = await runtime.prepare(parsed.data.model, parsed.data.effort, request.signal)
    } catch (error) {
      const safe = codexPublicError(error)
      return Response.json({ error: safe.message }, { status: safe.statusCode, headers: { "Cache-Control": "no-store" } })
    }
  } else if (parsed.data.effort === "none" || parsed.data.effort === "minimal") {
    return Response.json({ error: "This provider does not support the selected reasoning effort" }, { status: 400 })
  }

  let harnessAuth: Awaited<ReturnType<typeof ensureHarnessToken>> | undefined
  try {
    if (!isCodex) harnessAuth = await ensureHarnessToken({
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to authorize harness",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    )
  }

  const { sessionId } = await context.params
  const encoder = new TextEncoder()
  const responseHeaders = new Headers({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  if (harnessAuth?.setCookie) {
    responseHeaders.append("Set-Cookie", harnessAuth.setCookie)
  }

  const cancellation = new AbortController()
  const signal = AbortSignal.any([request.signal, cancellation.signal])
  let cancelled = false
  const stream = new ReadableStream({
    cancel() {
      cancelled = true
      cancellation.abort()
    },
    async start(controller) {
      const write = (payload: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
      }
      try {
        for await (const event of runWebTurn({
          userId: session.user.id,
          sessionId,
          content: parsed.data.content,
          clientMessageId: parsed.data.clientMessageId,
          model: parsed.data.model,
          provider: parsed.data.provider,
          effort: parsed.data.effort,
          machineSize: parsed.data.machineSize,
          mode: parsed.data.mode ?? "agent",
          harnessToken: harnessAuth?.token ?? "",
          chatTransport,
          signal,
          references: parsed.data.references,
          localAttachments: parsed.data.localAttachments,
        })) {
          write(event)
        }
      } catch (error) {
        write({
          type: "error",
          message: error instanceof Error ? error.message : "Turn failed",
        })
        write({ type: "finish", reason: "error" })
      } finally {
        if (!cancelled) controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: responseHeaders,
  })
}
