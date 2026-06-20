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
  mode: "chat" | "tools" | "agent"
}

const DEFAULTS: CliConfig = {
  version,
  provider: "google",
  model: "gemini-2.5-flash",
  mode: "chat",
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
