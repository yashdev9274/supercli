import { getClient } from "./client"
import type { EnvName } from "./index"

const REFERENCE_PREFIX = "infisical://"
const DEFAULT_SECRET_PATH = "/nova/provider-installations"

type StoredCredential = Record<string, string | number | null | undefined>

type CredentialReference = {
  projectId: string
  environment: EnvName
  secretPath: string
  secretName: string
}

export interface PutCredentialOptions {
  namespace: string
  id: string
  credential: StoredCredential
  projectId?: string
  environment?: EnvName
  secretPath?: string
}

function defaultEnvironment(): EnvName {
  const configured = process.env.NOVA_CREDENTIAL_ENV
  if (configured === "dev" || configured === "staging" || configured === "prod") {
    return configured
  }
  if (process.env.VERCEL_ENV === "production") return "prod"
  if (process.env.VERCEL_ENV === "preview") return "staging"
  return "dev"
}

function configuredProjectId(projectId?: string): string {
  const value = projectId ?? process.env.INFISICAL_PROJECT_ID
  if (!value) throw new Error("INFISICAL_PROJECT_ID is required for provider credentials")
  return value
}

function safeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
  if (!normalized) throw new Error("Credential reference segment is empty")
  return normalized
}

function encodeReference(reference: CredentialReference): string {
  const path = reference.secretPath.replace(/^\/+|\/+$/g, "")
  return `${REFERENCE_PREFIX}${encodeURIComponent(reference.projectId)}/${reference.environment}/${path}/${encodeURIComponent(reference.secretName)}`
}

function parseReference(value: string): CredentialReference {
  if (!value.startsWith(REFERENCE_PREFIX)) {
    throw new Error("Unsupported credential reference")
  }
  const parts = value.slice(REFERENCE_PREFIX.length).split("/").filter(Boolean)
  if (parts.length < 4) throw new Error("Malformed credential reference")
  const [projectId, environment, ...pathAndName] = parts
  if (environment !== "dev" && environment !== "staging" && environment !== "prod") {
    throw new Error("Unsupported credential environment")
  }
  const secretName = pathAndName.pop()
  if (!secretName) throw new Error("Credential reference is missing a secret name")
  return {
    projectId: decodeURIComponent(projectId),
    environment,
    secretPath: `/${pathAndName.join("/")}`,
    secretName: decodeURIComponent(secretName),
  }
}

function isMissingSecret(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const status = "statusCode" in error ? error.statusCode : "status" in error ? error.status : null
  return status === 404
}

export async function putCredential(options: PutCredentialOptions): Promise<string> {
  const projectId = configuredProjectId(options.projectId)
  const environment = options.environment ?? defaultEnvironment()
  const secretPath = options.secretPath ?? DEFAULT_SECRET_PATH
  const secretName = `${safeSegment(options.namespace)}_${safeSegment(options.id)}`
  const secretValue = JSON.stringify(options.credential)
  const secrets = (await getClient("web")).secrets()
  const shared = { projectId, environment, secretPath }

  try {
    await secrets.updateSecret(secretName, { ...shared, secretValue })
  } catch (error) {
    if (!isMissingSecret(error)) throw error
    await secrets.createSecret(secretName, {
      ...shared,
      secretValue,
      secretComment: "Managed Nova provider credential. Do not copy into PostgreSQL.",
    })
  }

  return encodeReference({ projectId, environment, secretPath, secretName })
}

export async function getCredential<T extends StoredCredential>(reference: string): Promise<T> {
  const parsed = parseReference(reference)
  const secret = await (await getClient("web")).secrets().getSecret({
    projectId: parsed.projectId,
    environment: parsed.environment,
    secretPath: parsed.secretPath,
    secretName: parsed.secretName,
  })
  const credential = JSON.parse(secret.secretValue) as unknown
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    throw new Error("Stored credential has an invalid shape")
  }
  return credential as T
}
