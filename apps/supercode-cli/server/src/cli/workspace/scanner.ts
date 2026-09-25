/**
 * Workspace filesystem scan — tree, tech stack, git metadata.
 */
import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

export type FileNode = {
  name: string
  type: "file" | "dir"
  children?: FileNode[]
}

export type WorkspaceInfo = {
  dirName: string
  fullPath: string
  isGitRepo: boolean
  gitBranch: string | null
  fileCount: number
  fileTree: FileNode[]
  projectName: string | null
  techStack: string[]
  hasPackageJson: boolean
  hasTsconfig: boolean
  hasPrisma: boolean
  isMonorepo: boolean
  workspaceRoot: string
}

const ALWAYS_IGNORE = new Set([
  "node_modules", ".next", "dist", "build", ".git",
  ".cache", "coverage", ".turbo", "out", ".expo",
  "android", "ios", ".venv", "venv", "__pycache__",
  "target", "bin", "obj", ".vercel", ".serverless",
  "*.pyc", ".env", ".env.local",
])

const MAX_TREE_DEPTH = 2
const MAX_DIR_CHILDREN = 40

// ── ignore rules ───────────────────────────────────────────────────────────

async function readGitignore(dir: string): Promise<Set<string>> {
  const ignore = new Set<string>()
  try {
    const content = await fs.readFile(path.join(dir, ".gitignore"), "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith("#")) {
        ignore.add(trimmed.replace(/\/$/, ""))
      }
    }
  } catch {
    /* no gitignore */
  }
  return ignore
}

function shouldIgnore(name: string, gitignore: Set<string>): boolean {
  if (ALWAYS_IGNORE.has(name)) return true
  if (gitignore.has(name)) return true
  if (name.startsWith(".") && name !== ".gitignore") return true
  return false
}

async function mergeGitignores(...dirs: string[]): Promise<Set<string>> {
  const combined = new Set<string>()
  for (const dir of dirs) {
    const set = await readGitignore(dir)
    for (const x of set) combined.add(x)
  }
  return combined
}

// ── tree + count ───────────────────────────────────────────────────────────

async function scanDir(
  dirPath: string,
  gitignore: Set<string>,
  depth = 0,
): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH) return []

  let dirEntries: string[] = []
  try {
    dirEntries = await fs.readdir(dirPath)
  } catch {
    return []
  }

  // Prefer directories first, then alpha — heuristic (dot in name ≈ file).
  dirEntries.sort((a, b) => {
    const aIsDir = !a.includes(".")
    const bIsDir = !b.includes(".")
    if (aIsDir && !bIsDir) return -1
    if (!aIsDir && bIsDir) return 1
    return a.localeCompare(b)
  })

  const entries: FileNode[] = []
  for (const name of dirEntries) {
    if (shouldIgnore(name, gitignore)) continue
    if (entries.length >= MAX_DIR_CHILDREN) break

    const fullPath = path.join(dirPath, name)
    let stat
    try {
      stat = await fs.stat(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      const children = await scanDir(fullPath, gitignore, depth + 1)
      entries.push({ name, type: "dir", children })
    } else {
      entries.push({ name, type: "file" })
    }
  }

  return entries
}

async function countFiles(dirPath: string, gitignore: Set<string>): Promise<number> {
  let count = 0
  let dirEntries: string[] = []
  try {
    dirEntries = await fs.readdir(dirPath)
  } catch {
    return 0
  }

  for (const name of dirEntries) {
    if (shouldIgnore(name, gitignore)) continue
    const fullPath = path.join(dirPath, name)
    try {
      const stat = await fs.stat(fullPath)
      if (stat.isDirectory()) count += await countFiles(fullPath, gitignore)
      else count++
    } catch {
      /* skip */
    }
  }
  return count
}

// ── tech / git / package ───────────────────────────────────────────────────

const TECH_MARKERS: Array<[string | string[], string]> = [
  ["next", "Next.js"],
  ["react", "React"],
  [["@prisma/client", "prisma"], "Prisma ORM"],
  ["tailwindcss", "Tailwind CSS"],
  [["better-auth", "@better-auth"], "Better-Auth"],
  ["express", "Express"],
  [["@trpc/client", "@trpc/server"], "tRPC"],
  [["@tanstack/react-query", "@tanstack/query"], "TanStack Query"],
  ["zustand", "Zustand"],
  [["socket.io", "socket.io-client"], "Socket.io"],
  [["drizzle", "drizzle-orm"], "Drizzle ORM"],
  ["eslint", "ESLint"],
  ["prettier", "Prettier"],
  [["next-auth", "@auth/core"], "Next-Auth"],
  [["shadcn", "@radix-ui"], "shadcn/ui"],
  [["@clerk/nextjs", "clerk"], "Clerk"],
  [["aws-sdk", "@aws-sdk"], "AWS SDK"],
  [["graphql", "@apollo/client"], "GraphQL"],
]

function detectTechStack(dirPath: string): string[] {
  const stack: string[] = []

  try {
    const raw = fsSync.readFileSync(path.join(dirPath, "package.json"), "utf-8")
    const pkg = JSON.parse(raw)
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>

    for (const [keys, label] of TECH_MARKERS) {
      const list = Array.isArray(keys) ? keys : [keys]
      if (list.some((k) => allDeps[k])) stack.push(label)
    }

    if (allDeps.vitest) stack.push("Vitest")
    else if (allDeps.jest) stack.push("Jest")
  } catch {
    /* no package.json */
  }

  try {
    if (fsSync.existsSync(path.join(dirPath, "turbo.json")) && !stack.includes("Turborepo")) {
      stack.push("Turborepo")
    }
  } catch {
    /* ignore */
  }

  return stack
}

function getGitInfo(cwd: string): { isRepo: boolean; branch: string | null; root: string } {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim()
    return { isRepo: true, branch: branch || null, root }
  } catch {
    return { isRepo: false, branch: null, root: cwd }
  }
}

function readPackageJson(
  dirPath: string,
): { name?: string; private?: boolean; workspaces?: string[] } | null {
  try {
    const raw = fsSync.readFileSync(path.join(dirPath, "package.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

// ── public API ─────────────────────────────────────────────────────────────

export async function scanWorkspace(cwd?: string): Promise<WorkspaceInfo> {
  const startDir = cwd || process.cwd()
  const { isRepo, branch, root } = getGitInfo(startDir)
  const workspaceRoot = root || startDir

  const dirs = startDir !== workspaceRoot ? [workspaceRoot, startDir] : [workspaceRoot]
  const combined = await mergeGitignores(...dirs)

  const [fileTree, fileCount, pkg] = await Promise.all([
    scanDir(workspaceRoot, combined, 0),
    countFiles(workspaceRoot, combined),
    Promise.resolve(readPackageJson(workspaceRoot)),
  ])

  const techStack = detectTechStack(workspaceRoot)
  const [hasTsconfig, hasPrisma] = await Promise.all([
    pathExists(path.join(workspaceRoot, "tsconfig.json")),
    pathExists(path.join(workspaceRoot, "prisma", "schema.prisma")),
  ])
  const isMonorepo =
    !!(pkg?.workspaces && pkg.workspaces.length > 0) || techStack.includes("Turborepo")

  return {
    dirName: path.basename(workspaceRoot),
    fullPath: workspaceRoot,
    isGitRepo: isRepo,
    gitBranch: branch,
    fileCount,
    fileTree,
    projectName: pkg?.name || path.basename(workspaceRoot),
    techStack,
    hasPackageJson: !!pkg,
    hasTsconfig,
    hasPrisma,
    isMonorepo,
    workspaceRoot,
  }
}

export async function readProjectConfig(root: string, filename: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, filename), "utf-8")
  } catch {
    return null
  }
}
