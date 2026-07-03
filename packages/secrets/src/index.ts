import type { z } from "zod"
import { getClient } from "./client"
import { applySecrets } from "./apply"
import type { AppId } from "./resolve-token"

export type { AppId } from "./resolve-token"

export type EnvName = "dev" | "staging" | "prod"

export interface LoadSecretsOptions {
  app: AppId
  env: EnvName
  schema?: z.ZodTypeAny
  projectId?: string
}

const DEFAULT_PROJECT_ID = process.env.INFISICAL_PROJECT_ID

export async function loadSecrets(options: LoadSecretsOptions): Promise<void> {
  const { app, env, schema, projectId = DEFAULT_PROJECT_ID } = options

  if (!projectId) {
    throw new Error(
      "INFISICAL_PROJECT_ID is required. Set it via env or pass projectId in options.",
    )
  }

  const client = getClient(app)
  const secrets = await client.listSecrets({
    environment: env,
    projectId,
    attachToProcessEnv: false,
  })

  const flat: Record<string, string | undefined> = {}
  for (const secret of secrets) {
    const value = secret.secretValue ?? undefined
    if (value !== undefined) {
      flat[secret.secretKey] = value
    }
  }

  applySecrets(flat, app, env, schema)
}
