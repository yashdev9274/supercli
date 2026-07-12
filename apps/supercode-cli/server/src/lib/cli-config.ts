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
  provider: "concentrateai",
  model: "glm-5.1",
  mode: "chat",
}

const API_KEY_ENV_MAP: Record<ModelProvider, string> = {
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  concentrateai: "CONCENTRATEAI_API_KEY",
  mergedev: "MERGE_DEV_API_KEY",
}

export function getProviderApiKeys(): Partial<Record<ModelProvider, string>> {
  const keys: Partial<Record<ModelProvider, string>> = {}
  for (const [p, envVar] of Object.entries(API_KEY_ENV_MAP)) {
    const val = process.env[envVar]
    if (val) keys[p as ModelProvider] = val
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
  } catch {
    // no stored keys — fine
  }
}

export async function saveProviderApiKey(provider: ModelProvider, apiKey: string): Promise<void> {
  const config = await getCliConfig()
  const existingConfig = config || {}
  const currentKeys = (existingConfig as any)?.apiKeys || {}
  const updatedKeys = { ...currentKeys, [provider]: apiKey }
  await saveCliConfig({ apiKeys: updatedKeys } as any)
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
