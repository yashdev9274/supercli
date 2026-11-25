import prisma from "@super/db"
import { remoteConfig } from "@super/nova-runtime/remote"
import { z } from "zod"
import { CodexError } from "@super/codex-runtime/provider"
import { admitEveTurn, getEveAdmission, currentEveAdmission, EveAdmissionError } from "./admission"
import { queueEveRun } from "./worker"

const submission = z.object({
  content: z.string().min(1).max(16000), clientMessageId: z.string().min(1).max(128),
  provider: z.string().min(1).max(64), model: z.string().min(1).max(128),
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  mode: z.enum(["chat", "plan"]),
}).strict()
const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status)

export function eveHttpError(error: unknown): Response {
  if (error instanceof EveAdmissionError) return Response.json({ error: error.message }, { status: error.statusCode })
  if (error instanceof CodexError) return Response.json({ error: error.message }, { status: error.statusCode })
  return Response.json({ error: "Eve canary is unavailable. Its durable admission can be retried with the same client message ID." }, { status: 503 })
}

export async function submitEveHttp(userId: string, sessionId: string, body: unknown, surface: "web" | "desktop"): Promise<Response> {
  const parsed = submission.safeParse(body)
  if (!parsed.success) throw new EveAdmissionError("Eve canary accepts explicit chat/plan text only, without attachments or mutation requests", 400)
  if (process.env.NOVA_EVE_CANARY_ENABLED !== "true" || !(process.env.NOVA_EVE_CANARY_USER_IDS ?? "").split(",").map((value) => value.trim()).includes(userId)) throw new EveAdmissionError("Eve canary is not enabled for this user", 403)
  remoteConfig()
  if (!process.env.INNGEST_EVENT_KEY && process.env.INNGEST_DEV !== "1") throw new EveAdmissionError("Eve background delivery is not configured", 503)
  if (Number(process.versions.node.split(".")[0]) < 24 && typeof Bun === "undefined") throw new EveAdmissionError("Eve canary requires Node 24 or newer", 503)
  const admitted = await admitEveTurn({ ...parsed.data, userId, sessionId, surface })
  await queueEveRun(admitted.runId)
  const base = surface === "web" ? "/api/nova" : "/api/desktop/nova"
  return Response.json({ runtime: "eve", ...admitted, eventsPath: `${base}/sessions/${sessionId}/eve/${admitted.runId}/events` }, { status: 202, headers: { "Cache-Control": "no-store" } })
}

export async function readEveHttp(userId: string, sessionId: string, runId: string, after: string): Promise<Response> {
  const admission = await getEveAdmission(userId, sessionId, runId)
  const prefix = `nova-eve:${runId}:event:`
  if (after && (!after.startsWith(prefix) || !/^\d{12}:\d{6}$/.test(after.slice(prefix.length)))) throw new EveAdmissionError("Invalid Eve event cursor", 400)
  const rows = await prisma.toolInvocation.findMany({ where: { runId, capability: "nova-eve:event", ...(after ? { idempotencyKey: { gt: after } } : {}) }, orderBy: { idempotencyKey: "asc" }, take: 200, select: { idempotencyKey: true, result: true } })
  const events = rows.map((row) => ({ cursor: row.idempotencyKey, event: row.result ?? { type: "heartbeat" } }))
  return Response.json({ events, terminal: terminal(admission.run.status) && rows.length < 200 }, { headers: { "Cache-Control": "no-store" } })
}

export async function cancelEveHttp(userId: string, sessionId: string, runId: string): Promise<Response> {
  const admission = await getEveAdmission(userId, sessionId, runId)
  if (!terminal(admission.run.status)) {
    await prisma.agentRun.updateMany({ where: { id: runId, status: { notIn: ["completed", "failed", "cancelled"] } }, data: { cancellationAt: new Date(), cancellationReason: "User cancelled Eve canary", version: { increment: 1 } } })
    await queueEveRun(runId, "cancel")
  }
  return Response.json({ runId, cancellationRequested: !terminal(admission.run.status) }, { status: 202 })
}

export async function currentEveHttp(userId: string, sessionId: string): Promise<Response> {
  const admission = await currentEveAdmission(userId, sessionId)
  if (!admission) throw new EveAdmissionError("No active Eve run in this session", 404)
  return Response.json({ runtime: "eve", runId: admission.runId, provider: admission.scope.provider, model: admission.scope.model }, { headers: { "Cache-Control": "no-store" } })
}
