import type { z } from "zod"
import { SecretSchemaError } from "./errors"
import type { AppId, EnvName } from "./index"

export function applySecrets(
  secrets: Record<string, string | undefined>,
  app: AppId,
  env: EnvName,
  schema?: z.ZodTypeAny,
): void {
  if (schema) {
    const result = schema.safeParse(secrets)
    if (!result.success) {
      const issues = result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      )
      throw new SecretSchemaError(app, env, issues)
    }
  }

  for (const [key, value] of Object.entries(secrets)) {
    if (value !== undefined && !(key in process.env)) {
      process.env[key] = value
    }
  }
}
