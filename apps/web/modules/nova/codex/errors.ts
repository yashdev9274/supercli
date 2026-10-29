import { CodexError } from "./provider"

export function codexPublicError(error: unknown): CodexError {
  if (error instanceof CodexError) return error
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined
  if (code === "P2021" || code === "P2022") {
    return new CodexError("Codex storage is not set up. Apply the Nova Codex database migration, then restart Nova.", 503)
  }
  if (code === "P1001" || code === "P1002" || code === "P1017") {
    return new CodexError("Nova could not reach its database. Check the server database connection and retry.", 503)
  }
  return new CodexError("Codex connection is unavailable. Try again later.", 500)
}
