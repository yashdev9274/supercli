import fs from "fs/promises"
import path from "path"
import os from "os"
import { version } from "../../package.json"
import type { ModelProvider } from "src/cli/ai/provider"

const CONFIG_DIR = path.join(os.homedir(), ".config", "supercode")
const CONFIG_FILE = path.join(CONFIG_DIR, "cli-config.json")

export interface CliConfig {
  version: string
  provider: ModelProvider
  model: string
  mode: "chat" | "agent"
  apiKeys?: Partial<Record<ModelProvider, string>>
  mcpServers?: Record<string, McpServerConfig>
  mcpCredentials?: Record<string, McpCredentials>
  composioApiKey?: string
  composioSessionId?: string
  connectorConfigs?: Record<string, ConnectorCliConfig>
}

export interface ConnectorCliConfig {
  provider: string
  apiKey?: string
  endpointUrl?: string
  toolPackId?: string
  registeredUserId?: string
  enabled: boolean
}

export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
}

export interface McpCredentials {
  connectorUid?: string
  serverUrl?: string
  clientId?: string
  clientSecret?: string
  authType?: "oauth" | "basic" | "api-key"
  apiKey?: string
  tokenEndpoint?: string
  scopes?: string[]
}

const DEFAULTS: CliConfig = {
  version,
  provider: "supercode",
  model: "deepseek-v4-flash",
  mode: "chat",
}

const API_KEY_ENV_MAP: Record<ModelProvider, string> = {
  supercode: "",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  concentrateai: "CONCENTRATEAI_API_KEY",
  mergedev: "MERGE_DEV_API_KEY",
  orcarouter: "ORCAROUTER_API_KEY",
}

export function getProviderApiKeys(): Partial<Record<ModelProvider, string>> {
  const keys: Partial<Record<ModelProvider, string>> = {}
  for (const [p, envVar] of Object.entries(API_KEY_ENV_MAP)) {
    const provider = p as ModelProvider
    const byokKey = getByokSessionKey(provider)
    const val = byokKey || process.env[envVar]
    if (val) keys[provider] = val
  }
  return keys
}

export async function applyStoredApiKeys(): Promise<void> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8")
    const config = JSON.parse(data) as CliConfig
    if (config.apiKeys && config.version === version) {
      for (const [provider, key] of Object.entries(config.apiKeys)) {
        if (key) {
          const envVar = API_KEY_ENV_MAP[provider as ModelProvider]
          if (envVar) process.env[envVar] = key
        }
      }
    }
    // Clean up old persisted keys — all BYOK providers are now session-only
    if (config.apiKeys && Object.keys(config.apiKeys).length > 0) {
      await saveCliConfig({ apiKeys: {} } as any)
    }
  } catch {
    // no stored keys — fine
  }
}

const BYOK_ENV_OVERRIDES: Partial<Record<ModelProvider, { prod: string; dev: string }>> = {
  concentrateai: { prod: "CONCENTRATE_BYOK_PROD_KEY", dev: "CONCENTRATE_BYOK_DEV_KEY" },
  mergedev: { prod: "MERGE_DEV_BYOK_PROD_KEY", dev: "MERGE_DEV_BYOK_DEV_KEY" },
  google: { prod: "GOOGLE_BYOK_PROD_KEY", dev: "GOOGLE_BYOK_DEV_KEY" },
  openrouter: { prod: "OPENROUTER_BYOK_PROD_KEY", dev: "OPENROUTER_BYOK_DEV_KEY" },
  minimax: { prod: "MINIMAX_BYOK_PROD_KEY", dev: "MINIMAX_BYOK_DEV_KEY" },
  nvidia: { prod: "NVIDIA_BYOK_PROD_KEY", dev: "NVIDIA_BYOK_DEV_KEY" },
  orcarouter: { prod: "ORCAROUTER_BYOK_PROD_KEY", dev: "ORCAROUTER_BYOK_DEV_KEY" },
}

export function getByokSessionKey(provider: ModelProvider): string | undefined {
  const override = BYOK_ENV_OVERRIDES[provider]
  if (override) {
    return process.env[override.prod] || process.env[override.dev] || process.env[API_KEY_ENV_MAP[provider]] || undefined
  }
  return process.env[API_KEY_ENV_MAP[provider]] || undefined
}

export async function saveProviderApiKey(provider: ModelProvider, apiKey: string): Promise<void> {
  const byokOverride = BYOK_ENV_OVERRIDES[provider]
  if (byokOverride) {
    const serverUrl = process.env.SUPERCODE_SERVER_URL
    const isDev = !!(serverUrl && (serverUrl.includes("localhost") || serverUrl.includes("127.0.0.1")))
    process.env[isDev ? byokOverride.dev : byokOverride.prod] = apiKey
    return
  }
  const envVar = API_KEY_ENV_MAP[provider]
  if (envVar) process.env[envVar] = apiKey
}

export async function getCliConfig(): Promise<CliConfig | null> {
  try {
    const data = await fs.readFile(CONFIG_FILE, "utf-8")
    const config = JSON.parse(data) as CliConfig
    if (config.version === version) return config
    return null
  } catch {
    return null
  }
}

export async function saveCliConfig(updates: Partial<CliConfig>): Promise<CliConfig> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
    let existing: Record<string, unknown> = {}
    try {
      const data = await fs.readFile(CONFIG_FILE, "utf-8")
      existing = JSON.parse(data)
    } catch {}
    const config = { ...DEFAULTS, ...existing, ...updates, version }
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8")
    return config as CliConfig
  } catch {
    return { ...DEFAULTS, ...updates, version }
  }
}
