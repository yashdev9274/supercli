import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

const E164_PATTERN = /^\+[1-9]\d{7,14}$/

export function normalizePhoneNumber(input: string): string {
  const compact = input.trim().replace(/[\s().-]/g, "")
  const normalized = compact.startsWith("+") ? compact : `+${compact}`
  if (!E164_PATTERN.test(normalized)) {
    throw new Error("Enter a valid international phone number")
  }
  return normalized
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 6) return "••••"
  return `${phone.slice(0, 3)}••••${phone.slice(-3)}`
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function hashOtp(challengeId: string, otp: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${challengeId}:${otp}`)
    .digest("hex")
}

export function verifyOtpHash(
  challengeId: string,
  otp: string,
  expectedHash: string,
  secret: string,
): boolean {
  const actual = Buffer.from(hashOtp(challengeId, otp, secret), "utf8")
  const expected = Buffer.from(expectedHash, "utf8")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
