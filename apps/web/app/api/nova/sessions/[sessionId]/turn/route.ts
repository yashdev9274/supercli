import { auth } from "@super/auth/server"
import prisma from "@super/db"
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
import { createProviderTransport } from "@/modules/nova/provider-credentials/runtime"
import { isProviderCredentialProvider, readProviderConfig } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"
import type { ChatTransport } from "@/modules/nova/harness/agent"
import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { referencesInputSchema } from "@/modules/nova/references/contracts"
import { runWebTurn } from "@/modules/nova/sessions/turn"
import { resumeHarnessInput } from "@/modules/nova/harness/durable-store"
import { machineSizeSchema } from "@/modules/nova/sandbox/machine-sizes"
import { validateMachineSelection } from "@/modules/nova/sandbox/machine-config"
import { resolveNovaTurnMode } from "@/modules/nova-web/resolve-mode"

const turnSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  resumeRunId: z.string().min(1).max(128).optional(),
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

  const { sessionId } = await context.params
  let body: unknown
  try {
    body = await request.json()
    const resume = z.object({ resumeRunId: z.string().min(1).max(128) }).safeParse(body)
    if (resume.success) body = { ...await resumeHarnessInput(session.user.id, sessionId, resume.data.resumeRunId), resumeRunId: resume.data.resumeRunId }
  } catch {
    return Response.json({ error: "Resume unavailable or invalid request" }, { status: 409 })
  }
  const parsed = turnSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid turn", issues: parsed.error.issues }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const agentSelection = await prisma.agentSession.findFirst({
    where: { id: sessionId, initiatorMembership: { userId: session.user.id } },
    select: { agent: { select: { provider: true, model: true } } },
  })
  const provider = parsed.data.provider ?? agentSelection?.agent?.provider ?? undefined
  const model = parsed.data.model ?? agentSelection?.agent?.model ?? undefined

  if (provider === CHATGPT_PROVIDER) {
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

  const isCodex = provider === CODEX_PROVIDER
  const isExternalProvider = Boolean(provider && isProviderCredentialProvider(provider))
  let chatTransport: ChatTransport | undefined
  if (isCodex) {
    try {
      assertCodexOrigin(request)
      const runtime = createCodexRuntime(await codexContextForRequest(request))
      chatTransport = await runtime.prepare(model, parsed.data.effort, request.signal)
    } catch (error) {
      const safe = codexPublicError(error)
      return Response.json({ error: safe.message }, { status: safe.statusCode, headers: { "Cache-Control": "no-store" } })
    }
  } else if (isExternalProvider) {
    try {
      const state = await readProviderConfig(request, provider!)
      if (!state.config) throw new ProviderCredentialError(`Connect ${state.provider} in Settings → Models`, 409)
      chatTransport = createProviderTransport(state.provider, state.config)
    } catch (error) {
      const status = error instanceof ProviderCredentialError ? error.statusCode : 502
      return Response.json({ error: error instanceof Error ? error.message : "Provider connection failed" }, { status, headers: { "Cache-Control": "no-store" } })
    }
  } else if (parsed.data.effort === "none" || parsed.data.effort === "minimal") {
    return Response.json({ error: "This provider does not support the selected reasoning effort" }, { status: 400 })
  }

  let harnessAuth: Awaited<ReturnType<typeof ensureHarnessToken>> | undefined
  try {
    harnessAuth = await ensureHarnessToken({
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
          resumeRunId: parsed.data.resumeRunId,
          content: parsed.data.content,
          clientMessageId: parsed.data.clientMessageId,
          model,
          provider,
          effort: parsed.data.effort,
          machineSize: parsed.data.machineSize,
          mode: parsed.data.mode ?? resolveNovaTurnMode({ message: parsed.data.content }).mode,
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
