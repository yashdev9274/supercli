import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { MissingInfisicalTokenError } from "./errors"

export type AppId = "web" | "cli-server" | "terminal"

function inferAppTokenVar(app: AppId): string {
  return `INFISICAL_TOKEN_${app.replace(/-/g, "_").toUpperCase()}`
}

function readLocalSessionToken(): string | null {
  const configPath = join(homedir(), ".infisical", "infisical-config.json")
  if (!existsSync(configPath)) return null
  try {
    const raw = readFileSync(configPath, "utf-8")
    const config = JSON.parse(raw)
    return config?.token ?? config?.accessToken ?? null
  } catch {
    return null
  }
}

export interface ResolvedToken {
  token: string
  source: "env" | "generic-env" | "local-session"
}

export function resolveToken(app: AppId): ResolvedToken {
  const appVar = inferAppTokenVar(app)
  const appToken = process.env[appVar]
  if (appToken) return { token: appToken, source: "env" }

  const genericToken = process.env.INFISICAL_TOKEN
  if (genericToken) return { token: genericToken, source: "generic-env" }

  const localToken = readLocalSessionToken()
  if (localToken) return { token: localToken, source: "local-session" }

  throw new MissingInfisicalTokenError(app)
}
