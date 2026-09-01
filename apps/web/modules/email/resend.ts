import { Resend } from "resend"

let client: Resend | null = null

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) return null
  if (!client) client = new Resend(key)
  return client
}

export function getResendFromAddress(): string {
  // Prefer verified domain sender; fall back to Resend test sender for local.
  const raw =
    process.env.RESEND_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    "Supercode <onboarding@resend.dev>"

  // Ensure friendly-name format when only an address is provided.
  if (raw.includes("<") && raw.includes(">")) return raw
  if (raw.includes("@")) return `Supercode <${raw}>`
  return raw
}

/** Product marketing / code-review landing. */
export function getCodeReviewAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CODE_REVIEW_URL?.trim() ||
    process.env.RESEND_APP_URL?.trim() ||
    "https://supercodeai.tech/code-review"
  )
}

/** Authenticated dashboard base (no trailing slash). */
export function getDashboardBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim() ||
    process.env.RESEND_DASHBOARD_URL?.trim() ||
    "https://supercodeai.vercel.app/dashboard"
  return raw.replace(/\/+$/, "")
}
