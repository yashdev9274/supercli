/**
 * Rank project paths for automatic turn packing.
 * Query-matched source files beat bootstrap configs so implement tasks
 * get real components instead of only package.json / tsconfig.
 */

export const MAX_PROJECT_PACK_FILES = 16
export const MAX_BOOTSTRAP_CONFIGS = 2

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|css|scss|mdx?)$/i
const CONFIG_NAMES = new Set([
  "package.json",
  "readme.md",
  "readme",
  "tsconfig.json",
  "jsconfig.json",
  "cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "gemfile",
  "dockerfile",
  "compose.yaml",
  "docker-compose.yml",
  "agents.md",
  "schema.prisma",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
])

/** Objective tokens → extra path needles to search for. */
const SYNONYMS: Record<string, string[]> = {
  sidebar: ["sidebar", "side-bar", "panel", "drawer", "shell", "layout", "rail"],
  panel: ["panel", "sidebar", "workspace-panel", "drawer"],
  right: ["right", "workspace-panel", "aside"],
  left: ["left", "sidebar", "nav"],
  ui: ["components", "ui", ".tsx", "layout"],
  responsive: ["responsive", "resizable", "resize", "drawer", "breakpoint", "md:", "sm:"],
  adjustable: ["resizable", "resize", "panel", "drag"],
  resize: ["resizable", "resize", "panel-group", "panelresize"],
  resizable: ["resizable", "panel-group", "panelresizehandle"],
  formatting: ["format", "file-card", "code-block", "codeblock", "prett", "wrap"],
  files: ["files", "file", "workspace-panel", "file-tree", "filetree", "file-list", "filelist"],
  file: ["file", "files", "workspace-panel", "file-card"],
  layout: ["layout", "shell", "panel", "sidebar"],
  thread: ["thread", "timeline", "composer", "chat"],
  composer: ["composer", "editor", "input"],
  chat: ["thread", "timeline", "composer", "message"],
  nova: ["nova-web", "nova"],
  web: ["nova-web", "apps/web"],
  workspace: ["workspace", "workspace-panel"],
  theme: ["theme", "tokens", "css", "tailwind"],
  style: ["css", "theme", "style", "tailwind"],
  css: ["css", "theme", "globals"],
  button: ["button", "components/ui"],
  modal: ["modal", "dialog"],
  dialog: ["dialog", "modal"],
  settings: ["settings"],
  auth: ["auth", "session", "login"],
  api: ["api", "route", "handler"],
  db: ["prisma", "schema", "db"],
  prisma: ["prisma", "schema"],
}

const IMPLEMENT_HINTS = new Set([
  "fix", "implement", "build", "make", "improve", "change", "update", "add",
  "refactor", "rewrite", "redesign", "polish", "adjust", "wire", "create",
  "patch", "edit", "move", "split", "merge", "remove", "delete", "replace",
])

function tokenize(objective: string): string[] {
  return objective
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
}

function expandNeedles(objective: string): { needles: string[]; implementIntent: boolean } {
  const tokens = tokenize(objective)
  const needles = new Set<string>()
  let implementIntent = false

  for (const token of tokens) {
    if (IMPLEMENT_HINTS.has(token)) implementIntent = true
    if (token.length >= 2) needles.add(token)
    const extras = SYNONYMS[token]
    if (extras) for (const extra of extras) needles.add(extra)
  }

  // Multi-word heuristics for common Nova web asks
  const lower = objective.toLowerCase()
  if (lower.includes("right sidebar") || lower.includes("right panel") || lower.includes("workspace panel")) {
    needles.add("workspace-panel")
    needles.add("workspace")
    needles.add("panel")
    implementIntent = true
  }
  if (lower.includes("left sidebar") || lower.includes("nav sidebar")) {
    needles.add("sidebar")
    implementIntent = true
  }
  if (lower.includes("nova web") || lower.includes("nova-web")) {
    needles.add("nova-web")
    needles.add("apps/web")
  }
  if (lower.includes("file format") || lower.includes("formatting of file") || lower.includes("format files")) {
    needles.add("workspace-panel")
    needles.add("file")
    needles.add("code")
  }

  return { needles: [...needles], implementIntent }
}

export function scoreProjectPath(path: string, objective: string): number {
  const { needles, implementIntent } = expandNeedles(objective)
  const lower = path.toLowerCase().replaceAll("\\", "/")
  const base = lower.split("/").pop() || lower
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : ""
  let score = 0

  const isConfig = CONFIG_NAMES.has(base)
  const isSource = SOURCE_EXT.test(base)

  // Query / synonym hits dominate
  for (const needle of needles) {
    if (needle.length < 2) continue
    if (lower.includes(needle)) score += needle.length >= 6 ? 40 : 28
    if (base.includes(needle)) score += 20
    // Path segment exact-ish match
    if (lower.split("/").some((seg) => seg === needle || seg.startsWith(`${needle}.`))) score += 35
  }

  if (isSource) score += 12
  if (/\.tsx$/.test(base)) score += 8
  if (lower.includes("/components/")) score += 10
  if (lower.includes("/nova-web/")) score += 15
  if (lower.includes("/modules/")) score += 4

  // Prefer shallower paths slightly
  score += Math.max(0, 12 - lower.split("/").length)

  // Configs: small baseline only. On implement intents they must not crowd out source.
  if (isConfig) {
    score += implementIntent ? 8 : 50
  }

  // Penalize lockfiles / generated noise
  if (/lockb?$|lock\.json$|lock\.yaml$/.test(base)) score -= 40
  if (lower.includes("/node_modules/") || lower.includes("/.next/")) score -= 100
  if (ext === ".map" || ext === ".d.ts") score -= 20

  return score
}

export type RankedPath = { path: string; score: number; kind: "source" | "config" | "other" }

export function rankProjectPaths(
  paths: string[],
  objective: string,
  limit = MAX_PROJECT_PACK_FILES,
): RankedPath[] {
  const { implementIntent } = expandNeedles(objective)
  const ranked: RankedPath[] = paths
    .filter((path) => {
      const lower = path.toLowerCase().replaceAll("\\", "/")
      return !lower.includes("/node_modules/")
        && !lower.startsWith("node_modules/")
        && !lower.includes("/.next/")
        && !lower.includes("/dist/")
        && !lower.includes("/build/")
    })
    .map((path) => {
      const base = path.toLowerCase().split("/").pop() || path.toLowerCase()
      const kind: RankedPath["kind"] = CONFIG_NAMES.has(base)
        ? "config"
        : SOURCE_EXT.test(base)
          ? "source"
          : "other"
      return { path, score: scoreProjectPath(path, objective), kind }
    })

  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))

  const selected: RankedPath[] = []
  let configs = 0
  const minScore = implementIntent ? 20 : 8

  // Pass 1: strong query matches (prefer source)
  for (const item of ranked) {
    if (selected.length >= limit) break
    if (item.score < minScore) continue
    if (item.kind === "config") {
      if (configs >= MAX_BOOTSTRAP_CONFIGS) continue
      configs += 1
    }
    selected.push(item)
  }

  // Pass 2: if we still have almost nothing, take top sources by score regardless
  if (selected.length < Math.min(4, limit)) {
    for (const item of ranked) {
      if (selected.length >= limit) break
      if (selected.some((s) => s.path === item.path)) continue
      if (item.kind === "config") continue
      if (item.kind !== "source" && item.score < 5) continue
      selected.push(item)
    }
  }

  // Pass 3: bootstrap a couple configs if room and none yet
  if (configs === 0) {
    for (const item of ranked) {
      if (selected.length >= limit) break
      if (item.kind !== "config") continue
      if (selected.some((s) => s.path === item.path)) continue
      selected.push(item)
      configs += 1
      if (configs >= MAX_BOOTSTRAP_CONFIGS) break
    }
  }

  return selected
}

export function isLikelyTextProjectPath(path: string): boolean {
  const base = path.toLowerCase().split("/").pop() || ""
  if (CONFIG_NAMES.has(base)) return true
  return SOURCE_EXT.test(base)
    || /\.(json|ya?ml|toml|svg|graphql|gql|sql|prisma|env|sh|html)$/i.test(base)
}
