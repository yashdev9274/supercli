import { createHash, createPublicKey, verify } from "node:crypto"

export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("base64url")
}

function decode(value: string, size?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoding")
  const bytes = Buffer.from(value, "base64url")
  if (bytes.toString("base64url") !== value || (size !== undefined && bytes.length !== size)) throw new Error("Invalid encoding")
  return bytes
}

export function enrollmentMessage(code: string, key: string): Buffer {
  decode(code, 32)
  return Buffer.from(JSON.stringify(["nova-desktop-enrollment-v1", hash(code), key]))
}

export type DeviceProof = {
  deviceId: string
  operation: "claim" | "start" | "complete"
  commandId: string
  fence: string | null
  result: unknown
  timestamp: number
  nonce: string
  signature: string
}

export type PollProof = {
  deviceId: string
  timestamp: number
  nonce: string
  signature: string
}

export function pollMessage(proof: Omit<PollProof, "signature">): Buffer {
  if (!Number.isSafeInteger(proof.timestamp) || proof.timestamp < 0) throw new Error("Invalid timestamp")
  decode(proof.nonce, 32)
  return Buffer.from(JSON.stringify(["nova-desktop-poll-v1", proof.deviceId, proof.timestamp, proof.nonce]))
}

export function requestMessage(proof: Omit<DeviceProof, "signature">): Buffer {
  if (!Number.isSafeInteger(proof.timestamp) || proof.timestamp < 0) throw new Error("Invalid timestamp")
  decode(proof.nonce, 32)
  return Buffer.from(JSON.stringify(["nova-desktop-request-v1", proof.deviceId, proof.operation, proof.commandId, proof.fence, proof.result, proof.timestamp, proof.nonce]))
}

export function verifyProof(key: string, message: Buffer, signature: string): boolean {
  try {
    const der = decode(key)
    const publicKey = createPublicKey({ key: der, format: "der", type: "spki" })
    return publicKey.asymmetricKeyType === "ed25519"
      && publicKey.export({ format: "der", type: "spki" }).equals(der)
      && verify(null, message, publicKey, decode(signature, 64))
  } catch {
    return false
  }
}
