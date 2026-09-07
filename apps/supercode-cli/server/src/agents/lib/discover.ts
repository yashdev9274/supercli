import { readdir, readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { DefinedTool, DefinedAgent, DefinedSkill } from "./define.ts"
import type { ToolMeta, ToolCategory } from "./types.ts"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const AGENTS_ROOT = path.resolve(__dirname, "..")
export const TOOLS_DIR = path.join(AGENTS_ROOT, "tools")
export const SKILLS_DIR = path.join(AGENTS_ROOT, "skills")
export const SUBAGENTS_DIR = path.join(AGENTS_ROOT, "subagents")

let toolsCache: Record<string, DefinedTool> | null = null
let toolsSdkCache: Record<string, unknown> | null = null
let toolMetaCache: Record<string, ToolMeta> | null = null
let agentsCache: Map<string, DefinedAgent> | null = null
let skillsCache: DefinedSkill[] | null = null

const WRITE_TOOLS = new Set(["write_file", "edit_file"])
const EXEC_TOOLS = new Set(["run_command", "code_exec"])
const WEB_TOOLS = new Set([
  "url_fetch",
  "web_search",
  "firecrawl_search",
  "firecrawl_scrape",
  "firecrawl_map",
  "exa_search",
  "exa_fetch",
])
const AGENT_TOOLS = new Set([
  "delegate",
  "task",
  "question",
  "todowrite",
  "skill",
  "switch_to_agent_mode",
  "crisp_review",
  "crisp_audit",
  "crisp_debt",
  "crisp_gain",
])

function inferCategory(name: string): ToolCategory {
  if (WRITE_TOOLS.has(name)) return "write"
  if (EXEC_TOOLS.has(name)) return "execute"
  if (WEB_TOOLS.has(name)) return "web"
  if (AGENT_TOOLS.has(name)) return "agent"
  return "read"
}

function requiresPermission(name: string, category: ToolCategory): boolean {
  return category === "write" || category === "execute"
}

/**
 * Discover tools under src/agents/tools/*.ts
 * Filename slug (without ext) is the model-facing tool name.
 */
export async function discoverTools(opts?: {
  force?: boolean
}): Promise<Record<string, DefinedTool>> {
  if (toolsCache && !opts?.force) return toolsCache

  const result: Record<string, DefinedTool> = {}
  if (!existsSync(TOOLS_DIR)) {
    toolsCache = result
    return result
  }

  const entries = await readdir(TOOLS_DIR)
  for (const entry of entries) {
    if (!entry.endsWith(".ts")) continue
    if (entry.endsWith(".test.ts") || entry.endsWith(".d.ts")) continue
    if (entry === "meta.ts" || entry === "index.ts") continue

    const slug = entry.replace(/\.ts$/, "")
    const full = path.join(TOOLS_DIR, entry)
    try {
      const mod = await import(pathToFileURL(full).href)
      const defined: DefinedTool | undefined =
        mod.default?.kind === "tool"
          ? mod.default
          : mod[`${camel(slug)}Tool`]?.kind === "tool"
            ? mod[`${camel(slug)}Tool`]
            : undefined

      if (!defined) {
        // Compat: module may export bare AI SDK tool under default / *Tool
        const sdk =
          mod.default?.sdk ??
          mod.default ??
          mod[`${camel(slug)}Tool`]?.sdk ??
          mod[`${camel(slug)}Tool`]
        if (sdk) {
          result[slug] = {
            kind: "tool",
            description: sdk.description ?? slug,
            inputSchema: sdk.inputSchema ?? sdk.parameters,
            execute: sdk.execute ?? (async () => ({})),
            name: slug,
            sdk,
          }
          continue
        }
        console.warn(`[agents/discover] skip tool ${entry}: no defineTool export`)
        continue
      }

      result[slug] = { ...defined, name: defined.name ?? slug }
    } catch (err: any) {
      console.warn(`[agents/discover] failed to load tool ${entry}: ${err?.message ?? err}`)
    }
  }

  toolsCache = result
  toolsSdkCache = null
  toolMetaCache = null
  return result
}

function camel(slug: string): string {
  return slug.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** Map of tool name → AI SDK tool instances for streamText. */
export async function loadToolsSdk(opts?: {
  force?: boolean
}): Promise<Record<string, unknown>> {
  if (toolsSdkCache && !opts?.force) return toolsSdkCache
  const defined = await discoverTools(opts)
  const out: Record<string, unknown> = {}
  for (const [name, t] of Object.entries(defined)) {
    out[name] = t.sdk
  }
  toolsSdkCache = out
  return out
}

export async function loadToolMeta(opts?: {
  force?: boolean
}): Promise<Record<string, ToolMeta>> {
  if (toolMetaCache && !opts?.force) return toolMetaCache
  const defined = await discoverTools(opts)
  const meta: Record<string, ToolMeta> = {}
  for (const [name, t] of Object.entries(defined)) {
    const category = inferCategory(name)
    meta[name] = {
      category,
      requiresPermission: requiresPermission(name, category),
      description: t.description,
    }
  }
  toolMetaCache = meta
  return meta
}

/** Sync accessors after first async discover (used by registry compat). */
export function getCachedToolsSdk(): Record<string, unknown> {
  return toolsSdkCache ?? {}
}

export function getCachedToolMeta(): Record<string, ToolMeta> {
  return toolMetaCache ?? {}
}

/**
 * Load root + subagent defineAgent configs.
 */
export async function discoverAgents(opts?: {
  force?: boolean
}): Promise<Map<string, DefinedAgent>> {
  if (agentsCache && !opts?.force) return agentsCache

  const map = new Map<string, DefinedAgent>()

  // Root agent
  const rootAgentPath = path.join(AGENTS_ROOT, "agent.ts")
  if (existsSync(rootAgentPath)) {
    try {
      const mod = await import(pathToFileURL(rootAgentPath).href + `?t=${Date.now()}`)
      const def: DefinedAgent | undefined =
        mod.default?.kind === "agent" ? mod.default : mod.agent
      if (def?.kind === "agent") map.set(def.info.name, def)
    } catch (err: any) {
      console.warn(`[agents/discover] root agent: ${err?.message ?? err}`)
    }
  }

  if (existsSync(SUBAGENTS_DIR)) {
    const dirs = await readdir(SUBAGENTS_DIR)
    for (const dir of dirs) {
      const agentFile = path.join(SUBAGENTS_DIR, dir, "agent.ts")
      if (!existsSync(agentFile)) continue
      try {
        const mod = await import(pathToFileURL(agentFile).href + `?t=${Date.now()}`)
        const def: DefinedAgent | undefined =
          mod.default?.kind === "agent" ? mod.default : mod.agent
        if (def?.kind === "agent") map.set(def.info.name, def)
      } catch (err: any) {
        console.warn(`[agents/discover] subagent ${dir}: ${err?.message ?? err}`)
      }
    }
  }

  agentsCache = map
  return map
}

export async function loadInstructions(
  name: string | undefined,
): Promise<string | undefined> {
  if (!name) return undefined

  // Prefer subagent instructions.md, then root, then legacy .txt prompts
  const candidates = [
    path.join(SUBAGENTS_DIR, name, "instructions.md"),
    path.join(AGENTS_ROOT, "instructions.md"),
    // legacy fallback under src/agent/prompts
    path.join(AGENTS_ROOT, "..", "agent", "prompts", `${name}.txt`),
  ]

  // Root build agent uses root instructions when name is "build"
  if (name === "build") {
    candidates.unshift(path.join(AGENTS_ROOT, "instructions.md"))
  }

  for (const p of candidates) {
    if (!existsSync(p)) continue
    try {
      return await readFile(p, "utf-8")
    } catch {
      /* try next */
    }
  }
  return undefined
}

export function loadInstructionsSync(name: string | undefined): string | undefined {
  if (!name) return undefined
  const candidates = [
    path.join(SUBAGENTS_DIR, name, "instructions.md"),
    path.join(AGENTS_ROOT, "instructions.md"),
    path.join(AGENTS_ROOT, "..", "agent", "prompts", `${name}.txt`),
  ]
  if (name === "build") {
    candidates.unshift(path.join(AGENTS_ROOT, "instructions.md"))
  }
  const fs = require("node:fs") as typeof import("node:fs")
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue
    try {
      return fs.readFileSync(p, "utf-8")
    } catch {
      /* next */
    }
  }
  return undefined
}

export async function discoverSkills(opts?: {
  force?: boolean
}): Promise<DefinedSkill[]> {
  if (skillsCache && !opts?.force) return skillsCache
  const out: DefinedSkill[] = []
  if (!existsSync(SKILLS_DIR)) {
    skillsCache = out
    return out
  }
  const entries = await readdir(SKILLS_DIR)
  for (const entry of entries) {
    const full = path.join(SKILLS_DIR, entry)
    const st = await stat(full).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) {
      const skillMd = path.join(full, "SKILL.md")
      if (!existsSync(skillMd)) continue
      const body = await readFile(skillMd, "utf-8")
      out.push({
        kind: "skill",
        name: entry,
        description: firstHeading(body) ?? entry,
        path: skillMd,
        body,
      })
    } else if (entry.endsWith(".md")) {
      const body = await readFile(full, "utf-8")
      const name = entry.replace(/\.md$/, "")
      out.push({
        kind: "skill",
        name,
        description: firstHeading(body) ?? name,
        path: full,
        body,
      })
    }
  }
  skillsCache = out
  return out
}

function firstHeading(md: string): string | undefined {
  const m = md.match(/^#\s+(.+)$/m)
  return m?.[1]?.trim()
}

export function clearDiscoverCache(): void {
  toolsCache = null
  toolsSdkCache = null
  toolMetaCache = null
  agentsCache = null
  skillsCache = null
}
