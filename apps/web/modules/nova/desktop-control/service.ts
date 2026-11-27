import { randomBytes, randomUUID } from "node:crypto"

import prisma, { type Prisma } from "@super/db"
import { normalizedArgsHash } from "@super/nova"

import { stableHash } from "../harness/durable"
import { isAllowedAction } from "./actions"
import { enrollmentMessage, hash, pollMessage, requestMessage, verifyProof, type DeviceProof, type PollProof } from "./protocol"

const token = () => randomBytes(32).toString("base64url")
const denied = (): never => { throw new Error("Desktop control request denied") }
const serializable = { isolationLevel: "Serializable" as const }
type Tx = Prisma.TransactionClient

async function membership(tx: Tx, userId: string, organizationId: string, membershipId?: string) {
  const row = await tx.organizationMembership.findFirst({ where: { id: membershipId, userId, organizationId, status: "active" } })
  if (!row) return denied()
  return row
}

async function binding(tx: Tx, command: {
  userId: string; organizationId: string; membershipId: string; deviceId: string
  sessionId: string; runId: string; invocationId: string; argsHash: string; invocationHash: string; toolName: string; capability: string
}) {
  await membership(tx, command.userId, command.organizationId, command.membershipId)
  const enrollment = await tx.desktopControlDevice.findFirst({ where: {
    deviceId: command.deviceId, userId: command.userId, organizationId: command.organizationId,
    membershipId: command.membershipId, revokedAt: null,
  } })
  const device = await tx.desktopDevice.findFirst({ where: {
    id: command.deviceId, userId: command.userId, organizationId: command.organizationId,
    status: "active", revokedAt: null, publicKey: { not: null },
  } })
  const session = await tx.agentSession.findFirst({ where: {
    id: command.sessionId, organizationId: command.organizationId, initiatorMembershipId: command.membershipId,
    status: { in: ["active", "sleeping"] }, activeRunId: command.runId,
  } })
  const run = await tx.agentRun.findFirst({ where: {
    id: command.runId, agentSessionId: command.sessionId, desktopDeviceId: command.deviceId,
    executionTarget: "desktop", status: "executing", cancellationAt: null,
  } })
  const invocation = await tx.toolInvocation.findFirst({ where: {
    id: command.invocationId, runId: command.runId, normalizedArgsHash: command.invocationHash,
    toolName: command.toolName, capability: command.capability, status: "executing",
  } })
  if (!enrollment || !device || !session || !run || !invocation || normalizedArgsHash(invocation.arguments) !== command.argsHash || !isAllowedAction(invocation.toolName, invocation.capability, invocation.arguments)) return denied()
  const invocationHash = invocation.capability.startsWith("nova-harness:")
    ? stableHash({ name: invocation.toolName, args: invocation.arguments })
    : normalizedArgsHash(invocation.arguments)
  if (invocationHash !== command.invocationHash) return denied()
  return { device, invocation }
}

export async function issueEnrollment(userId: string, organizationId: string) {
  const code = token()
  const expiresAt = new Date(Date.now() + 5 * 60_000)
  await prisma.$transaction(async tx => {
    const owner = await membership(tx, userId, organizationId)
    await tx.desktopControlEnrollment.create({ data: { codeHash: hash(code), userId, organizationId, membershipId: owner.id, expiresAt } })
  }, serializable)
  return { code, expiresAt }
}

export async function enrollDevice(input: { code: string; publicKey: string; signature: string; displayName: string }) {
  if (typeof input.displayName !== "string" || input.displayName.trim().length < 1 || input.displayName.length > 100) return denied()
  let valid = false
  try { valid = verifyProof(input.publicKey, enrollmentMessage(input.code, input.publicKey), input.signature) } catch { return denied() }
  if (!valid) return denied()
  return prisma.$transaction(async tx => {
    const now = new Date()
    const row = await tx.desktopControlEnrollment.findUnique({ where: { codeHash: hash(input.code) } })
    if (!row || row.usedAt || row.expiresAt <= now) return denied()
    await membership(tx, row.userId, row.organizationId, row.membershipId)
    const consumed = await tx.$executeRaw`UPDATE "desktop_control_enrollment" SET "usedAt" = clock_timestamp() WHERE "id" = ${row.id} AND "usedAt" IS NULL AND "expiresAt" > clock_timestamp()`
    if (consumed !== 1) return denied()
    const device = await tx.desktopDevice.create({ data: {
      userId: row.userId, organizationId: row.organizationId, devicePublicId: randomUUID(),
      displayName: input.displayName.trim(), publicKey: input.publicKey, status: "active",
    }, select: { id: true } })
    await tx.desktopControlDevice.create({ data: { deviceId: device.id, userId: row.userId, organizationId: row.organizationId, membershipId: row.membershipId } })
    return device
  }, serializable)
}

export async function listDevices(userId: string, organizationId: string) {
  return prisma.$transaction(async tx => {
    const owner = await membership(tx, userId, organizationId)
    const registrations = await tx.desktopControlDevice.findMany({ where: { userId, organizationId, membershipId: owner.id, revokedAt: null }, select: { deviceId: true } })
    return tx.desktopDevice.findMany({ where: { id: { in: registrations.map(row => row.deviceId) }, userId, organizationId, revokedAt: null }, select: { id: true, displayName: true, createdAt: true } })
  }, serializable)
}

export async function revokeDevice(userId: string, organizationId: string, deviceId: string) {
  return prisma.$transaction(async tx => {
    const owner = await membership(tx, userId, organizationId)
    const changed = await tx.desktopControlDevice.updateMany({ where: { deviceId, userId, organizationId, membershipId: owner.id, revokedAt: null }, data: { revokedAt: new Date() } })
    if (changed.count !== 1) return denied()
    return { ok: true }
  }, serializable)
}

export async function pollDevice(proof: PollProof) {
  try { proof = JSON.parse(JSON.stringify(proof)) as PollProof } catch { return denied() }
  if (!proof || !Number.isSafeInteger(proof.timestamp) || Math.abs(Date.now() - proof.timestamp) > 60_000) return denied()
  let message: Buffer
  try { message = pollMessage(proof) } catch { return denied() }
  return prisma.$transaction(async tx => {
    const now = new Date()
    if (Math.abs(now.getTime() - proof.timestamp) > 60_000) return denied()
    const registration = await tx.desktopControlDevice.findFirst({ where: { deviceId: proof.deviceId, revokedAt: null } })
    if (!registration) return denied()
    await membership(tx, registration.userId, registration.organizationId, registration.membershipId)
    const device = await tx.desktopDevice.findFirst({ where: { id: proof.deviceId, userId: registration.userId, organizationId: registration.organizationId, revokedAt: null, status: "active", publicKey: { not: null } } })
    if (!device?.publicKey || !verifyProof(device.publicKey, message, proof.signature)) return denied()
    await tx.desktopControlNonce.create({ data: { deviceId: device.id, nonceHash: hash(proof.nonce) } })
    const candidates = await tx.desktopControlCommand.findMany({ where: { deviceId: device.id, userId: registration.userId, organizationId: registration.organizationId, membershipId: registration.membershipId, status: "queued", expiresAt: { gt: now } }, orderBy: { createdAt: "asc" }, take: 50 })
    const commands = []
    for (const command of candidates) {
      try {
        await binding(tx, command)
        if (command.expiresAt > new Date()) commands.push({ id: command.id, expiresAt: command.expiresAt })
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Desktop control request denied") throw error
      }
    }
    return { commands }
  }, serializable)
}

export async function enqueueCommand(input: {
  userId: string; organizationId: string; deviceId: string; sessionId: string
  runId: string; invocationId: string; expiresAt: Date
}) {
  const now = Date.now()
  if (!(input.expiresAt instanceof Date) || !Number.isFinite(input.expiresAt.getTime()) || input.expiresAt.getTime() <= now || input.expiresAt.getTime() > now + 120_000) return denied()
  input = { ...input, expiresAt: new Date(input.expiresAt.getTime()) }
  return prisma.$transaction(async tx => {
    const owner = await membership(tx, input.userId, input.organizationId)
    const invocation = await tx.toolInvocation.findUnique({ where: { id: input.invocationId } })
    if (!invocation) return denied()
    const data = { ...input, membershipId: owner.id, argsHash: normalizedArgsHash(invocation.arguments), invocationHash: invocation.normalizedArgsHash, toolName: invocation.toolName, capability: invocation.capability }
    await binding(tx, data)
    if (input.expiresAt.getTime() <= Date.now()) return denied()
    return tx.desktopControlCommand.create({ data })
  }, serializable)
}

export async function deviceOperation(proof: DeviceProof) {
  try { proof = JSON.parse(JSON.stringify(proof)) as DeviceProof } catch { return denied() }
  if (!proof || typeof proof !== "object") return denied()
  if (!["claim", "start", "complete"].includes(proof.operation) || !Number.isSafeInteger(proof.timestamp) || Math.abs(Date.now() - proof.timestamp) > 60_000) return denied()
  if ((proof.operation === "claim" && (proof.fence !== null || proof.result !== null)) ||
    (proof.operation === "start" && (typeof proof.fence !== "string" || proof.result !== null)) ||
    (proof.operation === "complete" && (typeof proof.fence !== "string" || proof.result === null))) return denied()
  let message: Buffer
  try {
    message = requestMessage(proof)
    if (message.length > 65_536) return denied()
  } catch { return denied() }
  return prisma.$transaction(async tx => {
    const now = new Date()
    const command = await tx.desktopControlCommand.findUnique({ where: { id: proof.commandId } })
    if (!command || command.deviceId !== proof.deviceId || command.expiresAt <= now || Math.abs(now.getTime() - proof.timestamp) > 60_000) return denied()
    const { device, invocation } = await binding(tx, command)
    if (!device.publicKey || !verifyProof(device.publicKey, message, proof.signature)) return denied()
    await tx.desktopControlNonce.create({ data: { deviceId: device.id, nonceHash: hash(proof.nonce) } })
    const expected = proof.operation === "claim" ? "queued" : proof.operation === "start" ? "claimed" : "started"
    if (command.status !== expected || (proof.operation !== "claim" && command.fenceHash !== hash(proof.fence!))) return denied()
    const fence = proof.operation === "claim" ? token() : null
    const changed = proof.operation === "claim"
      ? await tx.$executeRaw`UPDATE "desktop_control_command" SET "status" = 'claimed', "claimedAt" = clock_timestamp(), "fenceHash" = ${hash(fence!)} WHERE "id" = ${command.id} AND "status" = ${expected} AND "fenceHash" IS NOT DISTINCT FROM ${command.fenceHash} AND "expiresAt" > clock_timestamp()`
      : proof.operation === "start"
        ? await tx.$executeRaw`UPDATE "desktop_control_command" SET "status" = 'started', "startedAt" = clock_timestamp() WHERE "id" = ${command.id} AND "status" = ${expected} AND "fenceHash" IS NOT DISTINCT FROM ${command.fenceHash} AND "expiresAt" > clock_timestamp()`
        : await tx.$executeRaw`UPDATE "desktop_control_command" SET "status" = 'completed', "completedAt" = clock_timestamp(), "result" = ${JSON.stringify(proof.result)}::jsonb WHERE "id" = ${command.id} AND "status" = ${expected} AND "fenceHash" IS NOT DISTINCT FROM ${command.fenceHash} AND "expiresAt" > clock_timestamp()`
    if (changed !== 1) return denied()
    return proof.operation === "claim" ? { fence, command: { id: command.id, sessionId: command.sessionId, runId: command.runId, invocationId: command.invocationId, toolName: command.toolName, capability: command.capability, argsHash: command.argsHash, arguments: invocation.arguments, expiresAt: command.expiresAt } } : { ok: true }
  }, serializable)
}
