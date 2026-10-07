import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest } from "next/server"
import { z } from "zod"

import { ensureHarnessToken } from "@/modules/nova/harness/auth"
import { referencesInputSchema } from "@/modules/nova/references/contracts"
import { runWebTurn } from "@/modules/nova/sessions/turn"

const turnSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
  model: z.string().trim().min(1).max(128).optional(),
  provider: z.string().trim().min(1).max(64).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  mode: z.enum(["agent", "plan", "chat"]).optional(),
  references: referencesInputSchema,
})

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

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

  let harnessAuth: Awaited<ReturnType<typeof ensureHarnessToken>>
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

  const { sessionId } = await context.params
  const encoder = new TextEncoder()
  const responseHeaders = new Headers({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  if (harnessAuth.setCookie) {
    responseHeaders.append("Set-Cookie", harnessAuth.setCookie)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const write = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
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
          harnessToken: harnessAuth.token,
          signal: request.signal,
          references: parsed.data.references,
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
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: responseHeaders,
  })
}
