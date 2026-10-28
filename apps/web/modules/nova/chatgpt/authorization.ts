import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export type ConnectionOwner = { userId: string; organizationId: string; browserSessionId: string }
export type AuthorizationTransaction = ConnectionOwner & {
  state: string
  nonce: string
  codeVerifier: string
  codeChallenge: string
  clientId: string
  redirectUri: string
  expiresAt: number
}

/** Production implementation must atomically consume from shared durable storage, never a process-local map. */
export interface AuthorizationTransactionStore {
  put(transaction: AuthorizationTransaction): Promise<void>
  take(state: string, owner: ConnectionOwner): Promise<AuthorizationTransaction | null>
}

function randomValue(): string {
  return randomBytes(32).toString("base64url")
}

/** Prepare only; deliberately does not construct a live authorization URL before hosted approval. */
export function prepareAuthorization(
  owner: ConnectionOwner,
  config: { clientId: string; redirectUri: string; allowedRedirectUris: readonly string[] },
  now = Date.now(),
): AuthorizationTransaction {
  const url = new URL(config.redirectUri)
  if (!owner.userId || !owner.organizationId || !owner.browserSessionId
    || !config.clientId.startsWith("oaiapp_")
    || url.protocol !== "https:" || url.username || url.password || url.hash || url.search
    || !config.allowedRedirectUris.includes(config.redirectUri)) {
    throw new Error("Invalid hosted ChatGPT authorization configuration")
  }
  const codeVerifier = randomValue()
  return {
    ...owner,
    state: randomValue(),
    nonce: randomValue(),
    codeVerifier,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    expiresAt: now + 10 * 60 * 1000,
  }
}

export async function consumeAuthorization(
  store: AuthorizationTransactionStore,
  owner: ConnectionOwner,
  callback: URL,
  now = Date.now(),
): Promise<{ code: string; transaction: AuthorizationTransaction }> {
  const state = callback.searchParams.get("state")
  const duplicated = ["state", "code", "error", "client_id"].some((key) => callback.searchParams.getAll(key).length > 1)
  if (!state || state.length > 128 || duplicated || callback.username || callback.password || callback.hash) {
    throw new Error("ChatGPT sign-in could not be verified")
  }
  const transaction = await store.take(state, owner)
  if (!transaction || transaction.expiresAt <= now
    || transaction.userId !== owner.userId || transaction.organizationId !== owner.organizationId
    || transaction.browserSessionId !== owner.browserSessionId
    || !equalValue(state, transaction.state)
    || `${callback.origin}${callback.pathname}` !== transaction.redirectUri) {
    throw new Error("ChatGPT sign-in could not be verified")
  }
  if (callback.searchParams.has("error")) throw new Error("ChatGPT sign-in was not completed")
  const returnedClient = callback.searchParams.get("client_id")
  const code = callback.searchParams.get("code")
  if (!code || code.length > 4096 || (returnedClient && returnedClient !== transaction.clientId)) {
    throw new Error("Invalid ChatGPT authorization callback")
  }
  return { code, transaction }
}

function equalValue(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type VerifiedIdentity = { issuer: string; subject: string; clientId: string }

/** Adapter MUST cryptographically verify signature/JWKS, issuer, audience, expiry and nonce. No decode-only fallback. */
export type VerifyIdentityToken = (
  token: string,
  expected: { issuer: string; clientId: string; nonce: string },
) => Promise<VerifiedIdentity>

export async function validateAuthorizationIdentity(input: {
  idToken: string
  transaction: AuthorizationTransaction
  verify: VerifyIdentityToken
  previous?: VerifiedIdentity
}): Promise<VerifiedIdentity> {
  const expected = { issuer: "https://auth.openai.com", clientId: input.transaction.clientId, nonce: input.transaction.nonce }
  const identity = await input.verify(input.idToken, expected)
  if (identity.issuer !== expected.issuer || identity.clientId !== expected.clientId || !identity.subject
    || (input.previous && (identity.subject !== input.previous.subject
      || identity.issuer !== input.previous.issuer || identity.clientId !== input.previous.clientId))) {
    throw new Error("ChatGPT account did not match the selected registration")
  }
  return identity
}
