import { beforeEach, describe, expect, mock, test } from "bun:test"
import { generateKeyPairSync, randomBytes, sign } from "node:crypto"

import { stableHash } from "../harness/durable"
import { enrollmentMessage, pollMessage, requestMessage, type DeviceProof } from "./protocol"

const { publicKey, privateKey } = generateKeyPairSync("ed25519")
const key = publicKey.export({ type: "spki", format: "der" }).toString("base64url")
const signMessage = (message: Buffer) => sign(null, message, privateKey).toString("base64url")
type Row = {
  id: string; userId: string; organizationId: string; membershipId: string; deviceId: string
  status: string; codeHash: string; usedAt: Date | null; revokedAt: Date | null; expiresAt: Date
  initiatorMembershipId: string; activeRunId: string; agentSessionId: string; desktopDeviceId: string
  executionTarget: string; cancellationAt: Date | null; runId: string; normalizedArgsHash: string
  toolName: string; capability: string; arguments: Record<string, unknown>; nonceHash: string
  fenceHash: string | null; result?: unknown
}
type State = {
  member: Row; enrollment: Row; device: Row; registration: Row; session: Row; run: Row
  invocation: Row; command: Row; nonces: string[]; expireAtWrite?: boolean
}
type WhereArgs = { where: Partial<Row> }
type DataArgs = { data: Partial<Row> }
let state: State

const db = {
  async $transaction(fn: (transaction: typeof tx) => Promise<unknown>) {
    const old = structuredClone(state)
    try { return await fn(tx) } catch (error) { state = old; throw error }
  },
}
const tx = {
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?")
    if (sql.includes("desktop_control_enrollment")) {
      if (state.enrollment.id !== values[0] || state.enrollment.usedAt || state.enrollment.expiresAt <= new Date()) return 0
      state.enrollment.usedAt = new Date()
      return 1
    }
    const status = sql.includes("'claimed'") ? "claimed" : sql.includes("'started'") ? "started" : "completed"
    const [value, id, expected, fenceHash] = status === "started" ? [null, ...values] : values
    if (state.expireAtWrite) state.command.expiresAt = new Date(0)
    if (state.command.id !== id || state.command.status !== expected || state.command.fenceHash !== fenceHash || state.command.expiresAt <= new Date()) return 0
    state.command.status = status
    if (status === "claimed") state.command.fenceHash = value as string
    if (status === "completed") state.command.result = JSON.parse(value as string)
    return 1
  },
  organizationMembership: { findFirst: async ({ where }: WhereArgs) => state.member.status === where.status && state.member.id === (where.id ?? state.member.id) && state.member.userId === where.userId && state.member.organizationId === where.organizationId ? state.member : null },
  desktopControlEnrollment: {
    create: async ({ data }: DataArgs) => { state.enrollment = { id: "e", usedAt: null, ...data } as Row; return state.enrollment },
    findUnique: async ({ where }: WhereArgs) => state.enrollment?.codeHash === where.codeHash ? state.enrollment : null,
    updateMany: async () => { if (state.enrollment.usedAt) return { count: 0 }; state.enrollment.usedAt = new Date(); return { count: 1 } },
  },
  desktopDevice: {
    create: async ({ data }: DataArgs) => { state.device = { id: "d", revokedAt: null, ...data } as Row; return { id: "d" } },
    findFirst: async ({ where }: WhereArgs) => state.device && state.device.id === where.id && state.device.userId === where.userId && state.device.organizationId === where.organizationId && state.device.status === "active" && !state.device.revokedAt ? state.device : null,
  },
  desktopControlDevice: {
    create: async ({ data }: DataArgs) => { state.registration = { ...data, revokedAt: null } as Row; return state.registration },
    findFirst: async ({ where }: WhereArgs) => state.registration && state.registration.deviceId === where.deviceId && !state.registration.revokedAt && (where.userId === undefined || state.registration.userId === where.userId) && (where.membershipId === undefined || state.registration.membershipId === where.membershipId) ? state.registration : null,
    updateMany: async ({ where }: WhereArgs) => { if (!state.registration || state.registration.userId !== where.userId || state.registration.revokedAt) return { count: 0 }; state.registration.revokedAt = new Date(); return { count: 1 } },
  },
  agentSession: { findFirst: async ({ where }: { where: Omit<Partial<Row>, "status"> & { status: { in: string[] } } }) => state.session.id === where.id && state.session.organizationId === where.organizationId && state.session.initiatorMembershipId === where.initiatorMembershipId && where.status.in.includes(state.session.status) && state.session.activeRunId === where.activeRunId ? state.session : null },
  agentRun: { findFirst: async ({ where }: WhereArgs) => state.run.id === where.id && state.run.agentSessionId === where.agentSessionId && state.run.desktopDeviceId === where.desktopDeviceId && state.run.executionTarget === where.executionTarget && state.run.status === where.status && !state.run.cancellationAt ? state.run : null },
  toolInvocation: {
    findUnique: async ({ where }: WhereArgs) => state.invocation.id === where.id ? state.invocation : null,
    findFirst: async ({ where }: WhereArgs) => state.invocation.id === where.id && state.invocation.runId === where.runId && state.invocation.normalizedArgsHash === where.normalizedArgsHash && state.invocation.toolName === where.toolName && state.invocation.capability === where.capability && state.invocation.status === where.status ? state.invocation : null,
  },
  desktopControlCommand: {
    create: async ({ data }: DataArgs) => { if (state.command) throw new Error("unique"); state.command = { id: "c", status: "queued", fenceHash: null, ...data } as Row; return state.command },
    findUnique: async ({ where }: WhereArgs) => state.command?.id === where.id ? state.command : null,
    findMany: async ({ where }: { where: Omit<Partial<Row>, "expiresAt"> & { expiresAt: { gt: Date } } }) => state.command && state.command.deviceId === where.deviceId && state.command.status === "queued" && state.command.expiresAt > where.expiresAt.gt ? [state.command] : [],
  },
  desktopControlNonce: { create: async ({ data }: { data: { nonceHash: string } }) => { if (state.nonces.includes(data.nonceHash)) throw new Error("unique"); state.nonces.push(data.nonceHash) } },
}

mock.module("@super/db", () => ({ default: db }))
const { issueEnrollment, enrollDevice, enqueueCommand, deviceOperation, pollDevice, revokeDevice } = await import("./service")

function proof(operation: DeviceProof["operation"], fence: string | null = null, result: unknown = null): DeviceProof {
  const unsigned = { deviceId: "d", commandId: "c", operation, fence, result, timestamp: Date.now(), nonce: randomBytes(32).toString("base64url") }
  return { ...unsigned, signature: signMessage(requestMessage(unsigned)) }
}

beforeEach(() => {
  const args = {}
  state = {
    member: { id: "m", userId: "u", organizationId: "o", status: "active" },
    session: { id: "s", organizationId: "o", initiatorMembershipId: "m", status: "active", activeRunId: "r" },
    run: { id: "r", agentSessionId: "s", desktopDeviceId: "d", executionTarget: "desktop", status: "executing", cancellationAt: null },
    invocation: { id: "i", runId: "r", status: "executing", toolName: "list_apps", capability: "nova-harness:list_apps", arguments: args, normalizedArgsHash: stableHash({ name: "list_apps", args }) },
    enrollment: null, device: null, registration: null, command: null, nonces: [],
  } as unknown as State
})

async function setup() {
  const { code } = await issueEnrollment("u", "o")
  const signature = signMessage(enrollmentMessage(code, key))
  await enrollDevice({ code, publicKey: key, signature, displayName: "Desktop" })
  return { code, signature }
}

describe("desktop control broker", () => {
  test("enrollment requires key possession and consumes code once", async () => {
    const { code, signature } = await setup()
    await expect(enrollDevice({ code, publicKey: key, signature, displayName: "Desktop" })).rejects.toThrow()
    const next = await issueEnrollment("u", "o")
    await expect(enrollDevice({ code: next.code, publicKey: key, signature, displayName: "Desktop" })).rejects.toThrow()
  })

  test("claim, start and completion are fenced and never reissued", async () => {
    await setup()
    await enqueueCommand({ userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) })
    const request = proof("claim")
    const claim = await deviceOperation(request)
    if (!("fence" in claim) || !claim.fence) throw new Error("Missing fence")
    await expect(deviceOperation(request)).rejects.toThrow()
    await expect(deviceOperation(proof("claim"))).rejects.toThrow()
    await expect(deviceOperation(proof("start", "wrong"))).rejects.toThrow()
    await deviceOperation(proof("start", claim.fence))
    await expect(deviceOperation(proof("start", claim.fence))).rejects.toThrow()
    await deviceOperation(proof("complete", claim.fence, { ok: true }))
    await expect(deviceOperation(proof("complete", claim.fence, { ok: true }))).rejects.toThrow()
  })

  test("membership, run, expiration and signatures are checked again", async () => {
    await setup()
    await enqueueCommand({ userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) })
    const request = proof("claim")
    await expect(deviceOperation({ ...request, commandId: "other" })).rejects.toThrow()
    state.member.status = "suspended"
    await expect(deviceOperation(request)).rejects.toThrow()
    state.member.status = "active"
    state.run.status = "cancelled"
    await expect(deviceOperation(request)).rejects.toThrow()
    state.run.status = "executing"
    state.command.expiresAt = new Date(0)
    await expect(deviceOperation(request)).rejects.toThrow()
  })

  test("rejects mismatched ownership, changed arguments, revocation and forged proofs", async () => {
    await setup()
    const input = { userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) }
    await expect(enqueueCommand({ ...input, userId: "other" })).rejects.toThrow()
    state.invocation.arguments = { action: "changed" }
    await expect(enqueueCommand(input)).rejects.toThrow()
    state.invocation.arguments = {}
    await enqueueCommand(input)
    const request = proof("claim")
    await expect(deviceOperation({ ...request, signature: signMessage(Buffer.from("forged")) })).rejects.toThrow()
    state.device.revokedAt = new Date()
    await expect(deviceOperation(request)).rejects.toThrow()
  })

  test("requires the journal execution phase and rejects unresolved approvals", async () => {
    await setup()
    const input = { userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) }
    state.run.status = "planning"
    await expect(enqueueCommand(input)).rejects.toThrow()
    state.run.status = "executing"
    state.invocation.status = "awaiting_input"
    await expect(enqueueCommand(input)).rejects.toThrow()
    state.invocation.status = "executing"
    state.session.status = "sleeping"
    await enqueueCommand(input)
    state.invocation.status = "awaiting_input"
    await expect(deviceOperation(proof("claim"))).rejects.toThrow()
  })

  test("enforces nonce size, result ownership and expiry at the state write", async () => {
    await setup()
    await enqueueCommand({ userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) })
    const request = proof("claim")
    await expect(deviceOperation({ ...request, nonce: "YQ" })).rejects.toThrow()
    const claim = await deviceOperation(request)
    if (!("fence" in claim) || !claim.fence) throw new Error("Missing fence")
    await deviceOperation(proof("start", claim.fence))
    const complete = proof("complete", claim.fence, { secret: "result" })
    await expect(deviceOperation({ ...complete, deviceId: "other" })).rejects.toThrow()
    state.expireAtWrite = true
    await expect(deviceOperation(complete)).rejects.toThrow()
    expect(state.command.status).toBe("started")
    expect(state.command.result).toBeUndefined()
  })

  test("polling requires a fresh proof and excludes claimed or revoked devices", async () => {
    await setup()
    await enqueueCommand({ userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) })
    const signedPoll = () => {
      const unsigned = { deviceId: "d", timestamp: Date.now(), nonce: randomBytes(32).toString("base64url") }
      return { ...unsigned, signature: signMessage(pollMessage(unsigned)) }
    }
    const first = signedPoll()
    expect((await pollDevice(first)).commands).toHaveLength(1)
    await expect(pollDevice(first)).rejects.toThrow()
    await deviceOperation(proof("claim"))
    expect((await pollDevice(signedPoll())).commands).toHaveLength(0)
    await expect(revokeDevice("other", "o", "d")).rejects.toThrow()
    await revokeDevice("u", "o", "d")
    await expect(pollDevice(signedPoll())).rejects.toThrow()
  })

  test("rejects unsupported actions and parameters", async () => {
    await setup()
    const input = { userId: "u", organizationId: "o", deviceId: "d", sessionId: "s", runId: "r", invocationId: "i", expiresAt: new Date(Date.now() + 30_000) }
    state.invocation.toolName = "click"
    state.invocation.capability = "nova-harness:click"
    state.invocation.normalizedArgsHash = stableHash({ name: "click", args: {} })
    await expect(enqueueCommand(input)).rejects.toThrow()
  })
})
