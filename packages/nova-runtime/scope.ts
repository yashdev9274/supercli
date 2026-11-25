import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { isIntegrationId, type IntegrationId } from "@super/agent-runtime/integrations"

export const NOVA_SCOPE_ISSUER = "nova"
export const NOVA_SCOPE_AUDIENCE = "nova-eve"
export const NOVA_SCOPE_MAX_TTL_SECONDS = 300

const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh"] as const

export type NovaScope = {
  organizationId: string
  userId: string
  membershipId: string
  novaSessionId: string
  provider: IntegrationId
  connectionId: string
  model: string
  effort?: typeof EFFORTS[number]
}

export type NovaScopeSession = {
  id: string
  organizationId: string
  initiatorMembership: {
    id: string
    organizationId: string
    userId: string
    status: string
  } | null
}

export interface NovaScopeStore {
  findSession(novaSessionId: string): Promise<NovaScopeSession | null>
  findConnection?(scope: NovaScope): Promise<NovaScopeConnection | null>
}

export type NovaScopeConnection = {
  connectionId: string
  provider: IntegrationId
  organizationId: string
  userId: string
  membershipId: string
  status: string
  enabled: boolean
}

export type NovaScopePrincipal = {
  principalType: "user"
  principalId: string
  authenticator: "nova-scope"
  issuer: typeof NOVA_SCOPE_ISSUER
  attributes: NovaScope
}

type TokenOptions = { secret: string; now?: number }
type NovaScopeClaims = NovaScope & { iss: string; aud: string; iat: number; exp: number }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validScope(value: unknown): value is NovaScope {
  if (!record(value)) return false
  for (const key of ["organizationId", "userId", "membershipId", "novaSessionId"] as const) {
    if (typeof value[key] !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(value[key])) return false
  }
  return isIntegrationId(value.provider)
    && typeof value.connectionId === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value.connectionId)
    && typeof value.model === "string"
    && value.model.length > 0
    && value.model.length <= 128
    && value.model.trim() === value.model
    && !/[\u0000-\u001f\u007f]/.test(value.model)
    && (value.effort === undefined || EFFORTS.includes(value.effort as typeof EFFORTS[number]))
}

function scopeOnly(scope: NovaScope): NovaScope {
  return {
    organizationId: scope.organizationId,
    userId: scope.userId,
    membershipId: scope.membershipId,
    novaSessionId: scope.novaSessionId,
    provider: scope.provider,
    connectionId: scope.connectionId,
    model: scope.model,
    ...(scope.effort === undefined ? {} : { effort: scope.effort }),
  }
}

export function scopeFromPrincipal(principal: { authenticator: string; issuer?: string; principalType: string; attributes: unknown } | null): NovaScope | null {
  if (principal?.authenticator !== "nova-scope" || principal.issuer !== NOVA_SCOPE_ISSUER || principal.principalType !== "user" || !validScope(principal.attributes)) return null
  return scopeOnly(principal.attributes)
}

function validSecret(secret: unknown): secret is string {
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32
}

function clock(now = Date.now()): number {
  if (!Number.isFinite(now) || now < 0) throw new Error("Invalid scope clock")
  return Math.floor(now / 1000)
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function decode(part: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error("Invalid token encoding")
  const bytes = Buffer.from(part, "base64url")
  if (bytes.toString("base64url") !== part) throw new Error("Invalid token encoding")
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}

export function signNovaScope(scope: NovaScope, options: TokenOptions & { ttlSeconds?: number }): string {
  if (!validSecret(options.secret) || !validScope(scope)) throw new Error("Invalid scope configuration")
  const ttl = options.ttlSeconds ?? NOVA_SCOPE_MAX_TTL_SECONDS
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > NOVA_SCOPE_MAX_TTL_SECONDS) {
    throw new Error("Invalid scope lifetime")
  }
  const iat = clock(options.now)
  const input = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    ...scopeOnly(scope), iss: NOVA_SCOPE_ISSUER, aud: NOVA_SCOPE_AUDIENCE, iat, exp: iat + ttl,
  })}`
  return `${input}.${createHmac("sha256", options.secret).update(input).digest("base64url")}`
}

export function verifyNovaScopeToken(token: string, options: TokenOptions): NovaScope | null {
  try {
    if (!validSecret(options.secret) || typeof token !== "string" || token.length > 4096) return null
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [headerPart, claimsPart, signaturePart] = parts as [string, string, string]
    if (!/^[A-Za-z0-9_-]{43}$/.test(signaturePart)) return null
    const signature = Buffer.from(signaturePart, "base64url")
    if (signature.toString("base64url") !== signaturePart) return null
    const expected = createHmac("sha256", options.secret).update(`${headerPart}.${claimsPart}`).digest()
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null
    const header = decode(headerPart)
    if (!record(header) || Object.keys(header).length !== 2 || header.alg !== "HS256" || header.typ !== "JWT") return null
    const claims = decode(claimsPart)
    const allowedKeys = ["organizationId", "userId", "membershipId", "novaSessionId", "provider", "connectionId", "model", "effort", "iss", "aud", "iat", "exp"]
    if (!validScope(claims) || !record(claims) || Object.keys(claims).some(key => !allowedKeys.includes(key))) return null
    const { iss, aud, iat, exp } = claims as NovaScopeClaims
    const now = clock(options.now)
    if (iss !== NOVA_SCOPE_ISSUER || aud !== NOVA_SCOPE_AUDIENCE
      || !Number.isSafeInteger(iat) || !Number.isSafeInteger(exp)
      || iat < 0 || iat > now || exp <= now || exp <= iat || exp - iat > NOVA_SCOPE_MAX_TTL_SECONDS) return null
    return scopeOnly(claims)
  } catch {
    return null
  }
}

export async function authorizeNovaSession(scope: NovaScope, store: NovaScopeStore): Promise<boolean> {
  if (!validScope(scope)) return false
  try {
    const session = await store.findSession(scope.novaSessionId)
    const membership = session?.initiatorMembership
    const owned = session?.id === scope.novaSessionId
      && session.organizationId === scope.organizationId
      && membership?.id === scope.membershipId
      && membership.organizationId === scope.organizationId
      && membership.userId === scope.userId
      && membership.status === "active"
    return owned
  } catch { return false }
}

export async function authorizeNovaScope(scope: NovaScope, store: NovaScopeStore): Promise<boolean> {
  if (!await authorizeNovaSession(scope, store)) return false
  try {
    const connection = await store.findConnection?.(scope)
    return connection?.connectionId === scope.connectionId
      && connection.provider === scope.provider
      && connection.organizationId === scope.organizationId
      && connection.userId === scope.userId
      && connection.membershipId === scope.membershipId
      && connection.status === "connected"
      && connection.enabled === true
  } catch {
    return false
  }
}

export async function authenticateNovaScope(
  request: Request,
  store: NovaScopeStore,
  env: Record<string, string | undefined> = process.env,
  now?: number,
): Promise<NovaScopePrincipal | null> {
  if (env.NOVA_EVE_ENABLED !== "true" || !validSecret(env.NOVA_EVE_SCOPE_SECRET)) return null
  const authorization = request.headers.get("authorization")
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i)
  if (!match) return null
  const scope = verifyNovaScopeToken(match[1]!, { secret: env.NOVA_EVE_SCOPE_SECRET, now })
  const path = new URL(request.url).pathname
  const observation = request.method === "GET" && /^\/eve\/v1\/session\/[^/]+\/stream$/.test(path)
    || request.method === "POST" && /^\/eve\/v1\/session\/[^/]+\/(?:cancel|end)$/.test(path)
  if (!scope || !await (observation ? authorizeNovaSession(scope, store) : authorizeNovaScope(scope, store))) return null
  const identity = [scope.organizationId, scope.userId, scope.membershipId, scope.novaSessionId]
  return {
    principalType: "user",
    principalId: `nova:${createHash("sha256").update(JSON.stringify(identity)).digest("base64url")}`,
    authenticator: "nova-scope",
    issuer: NOVA_SCOPE_ISSUER,
    attributes: scope,
  }
}
