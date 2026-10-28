import { CodexError, tokenSchema, type CodexTokens } from "./provider"
import type { CodexOwner, CodexRow, CodexStore } from "./service"
import type { CodexVault } from "./vault"

export type CodexCredentialContext = { owner: CodexOwner; store: CodexStore; vault: () => CodexVault }
export type CodexCredential = { tokens: CodexTokens; version: number }

export function createCodexCredentials(context: CodexCredentialContext, refresh: (tokens: CodexTokens) => Promise<CodexTokens>, now = Date.now) {
  const { owner, store } = context
  const binding = JSON.stringify([owner.organizationId, owner.userId, owner.membershipId, "credentials"])
  function assertConnected(row: CodexRow) {
    if (row.membershipId !== owner.membershipId || row.state !== "connected" || !row.encryptedCredentials) {
      throw new CodexError("Connect Codex in Settings → Models before using this model.", 409)
    }
  }
  async function read(signal?: AbortSignal): Promise<CodexCredential> {
    for (let tries = 0; tries < 65; tries++) {
      signal?.throwIfAborted()
      const row = await store.get()
      assertConnected(row)
      if (!row.nextPollAt) {
        return { tokens: tokenSchema.parse(context.vault().open(row.encryptedCredentials!, binding)), version: row.version }
      }
      if (row.nextPollAt.getTime() <= now()) {
        await store.compareAndSwap(row.version, { state: "failed", encryptedCredentials: null, nextPollAt: null, connectedAt: null })
        throw new CodexError("Codex refresh was interrupted. Reconnect Codex in Settings → Models.", 401)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250))
    }
    throw new CodexError("Codex is refreshing. Please retry shortly.", 409)
  }
  async function rotate(previous: CodexCredential, signal?: AbortSignal): Promise<CodexCredential> {
    signal?.throwIfAborted()
    const row = await store.get()
    assertConnected(row)
    if (row.version !== previous.version || row.nextPollAt) return read(signal)
    // Reuse nextPollAt as a refresh lease only while connected. Login polling uses other states.
    // A lost/uncertain rotation is never replayed; the expired lease requires reconnect.
    if (!await store.compareAndSwap(row.version, { nextPollAt: new Date(now() + 20_000) })) return read(signal)
    const version = row.version + 1
    try {
      const tokens = tokenSchema.parse(await refresh(previous.tokens))
      const saved = await store.compareAndSwap(version, {
        encryptedCredentials: context.vault().seal(tokens, binding), nextPollAt: null,
      })
      if (!saved) throw new CodexError("Codex connection changed. Reconnect before retrying.", 409)
      // Recheck active membership and disconnect after rotation, before issuing a request.
      return read(signal)
    } catch (error) {
      await store.compareAndSwap(version, { state: "failed", encryptedCredentials: null, nextPollAt: null, connectedAt: null })
      if (error instanceof CodexError) throw error
      throw new CodexError("Codex refresh failed. Reconnect Codex in Settings → Models.", 401)
    }
  }
  return { read, rotate }
}

export function codexAccountId(tokens: CodexTokens): string | undefined {
  // Routing hint from provider-issued stored tokens, not authentication/ownership evidence.
  try {
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8"))
    const id = payload["https://api.openai.com/auth"]?.chatgpt_account_id
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(id) ? id : undefined
  } catch { return undefined }
}
