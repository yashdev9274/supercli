import { auth } from "@super/auth/server"
import { z } from "zod"

import { deviceOperation, enrollDevice, enqueueCommand, issueEnrollment, listDevices, pollDevice, revokeDevice } from "./service"

const id = z.string().min(1).max(128)
const organization = z.object({ organizationId: id }).strict()
const proof = z.object({
  deviceId: id, operation: z.enum(["claim", "start", "complete"]), commandId: id,
  fence: z.string().max(128).nullable(), result: z.unknown(), timestamp: z.number().int().safe(),
  nonce: z.string().max(64), signature: z.string().max(128),
}).strict()
const poll = z.object({ deviceId: id, timestamp: z.number().int().safe(), nonce: z.string().max(64), signature: z.string().max(128) }).strict()
const schemas = {
  enrollment: organization,
  enroll: z.object({ code: z.string().max(64), publicKey: z.string().max(128), signature: z.string().max(128), displayName: z.string().min(1).max(100) }).strict(),
  list: organization,
  revoke: organization.extend({ deviceId: id }).strict(),
  create: organization.extend({ deviceId: id, sessionId: id, runId: id, invocationId: id, expiresAt: z.string().datetime() }).strict(),
  poll,
  claim: proof,
  start: proof,
  complete: proof,
} as const
export type Endpoint = keyof typeof schemas
const browserEndpoints = new Set<Endpoint>(["enrollment", "list", "revoke", "create"])
const responseHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }

export function desktopControlUnavailable(): Response {
  return Response.json({ error: "Desktop control is not available yet" }, { status: 503, headers: responseHeaders })
}

const broker = { deviceOperation, enrollDevice, enqueueCommand, issueEnrollment, listDevices, pollDevice, revokeDevice }

async function body(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new Error("invalid")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("invalid")
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 70_000) throw new Error("invalid")
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)))
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export async function handleDesktopControl(request: Request, endpoint: Endpoint, service: typeof broker = broker): Promise<Response> {
  const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: responseHeaders })
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405)
  let userId: string | undefined
  if (browserEndpoints.has(endpoint)) {
    const origin = request.headers.get("origin")
    const site = request.headers.get("sec-fetch-site")
    if (!origin || origin !== new URL(request.url).origin || (site && site !== "same-origin")) return reply({ error: "Forbidden" }, 403)
    try { userId = (await auth.api.getSession({ headers: request.headers }))?.user?.id } catch { return reply({ error: "Unauthorized" }, 401) }
    if (!userId) return reply({ error: "Unauthorized" }, 401)
  }
  let input: unknown
  try { input = await body(request) } catch { return reply({ error: "Invalid request" }, 400) }
  const parsed = schemas[endpoint].safeParse(input)
  if (!parsed.success) return reply({ error: "Invalid request" }, 400)
  try {
    switch (endpoint) {
      case "enrollment": return reply(await service.issueEnrollment(userId!, (parsed.data as z.infer<typeof organization>).organizationId), 201)
      case "enroll": return reply(await service.enrollDevice(parsed.data as z.infer<typeof schemas.enroll>), 201)
      case "list": return reply({ devices: await service.listDevices(userId!, (parsed.data as z.infer<typeof organization>).organizationId) })
      case "revoke": { const data = parsed.data as z.infer<typeof schemas.revoke>; return reply(await service.revokeDevice(userId!, data.organizationId, data.deviceId)) }
      case "create": { const data = parsed.data as z.infer<typeof schemas.create>; const command = await service.enqueueCommand({ ...data, expiresAt: new Date(data.expiresAt), userId: userId! }); return reply({ id: command.id, expiresAt: command.expiresAt }, 201) }
      case "poll": return reply(await service.pollDevice(parsed.data as z.infer<typeof poll>))
      case "claim":
      case "start":
      case "complete": {
        const data = parsed.data as z.infer<typeof proof>
        if (data.operation !== endpoint) return reply({ error: "Invalid request" }, 400)
        return reply(await service.deviceOperation(data))
      }
    }
  } catch {
    return reply({ error: "Request denied" }, 403)
  }
}
