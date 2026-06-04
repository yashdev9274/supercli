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
  } catch {}
  return ignore
}

function shouldIgnore(name: string, gitignore: Set<string>): boolean {
  if (ALWAYS_IGNORE.has(name)) return true
  if (gitignore.has(name)) return true
  if (name.startsWith(".") && name !== ".gitignore") return true
  return false
}

async function scanDir(
  dirPath: string,
  gitignore: Set<string>,
  depth: number = 0,
): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH) return []

  const entries: FileNode[] = []
  let dirEntries: string[] = []

  try {
    dirEntries = await fs.readdir(dirPath)
  } catch {
    return []
  }

  dirEntries.sort((a, b) => {
    const aIsDir = !a.includes(".")
    const bIsDir = !b.includes(".")
    if (aIsDir && !bIsDir) return -1
    if (!aIsDir && bIsDir) return 1
    return a.localeCompare(b)
  })

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
      if (stat.isDirectory()) {
        count += await countFiles(fullPath, gitignore)
      } else {
        count++
      }
    } catch {}
  }
  return count
}

function detectTechStack(dirPath: string): string[] {
  const stack: string[] = []

  try {
    const raw = fsSync.readFileSync(path.join(dirPath, "package.json"), "utf-8")
    const pkg = JSON.parse(raw)
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>

    if (allDeps.next) stack.push("Next.js")
    if (allDeps.react) stack.push("React")
    if (allDeps["@prisma/client"] || allDeps.prisma) stack.push("Prisma ORM")
    if (allDeps.tailwindcss) stack.push("Tailwind CSS")
    if (allDeps["better-auth"] || allDeps["@better-auth"]) stack.push("Better-Auth")
    if (allDeps.express) stack.push("Express")
    if (allDeps["@trpc/client"] || allDeps["@trpc/server"]) stack.push("tRPC")
    if (allDeps["@tanstack/react-query"] || allDeps["@tanstack/query"]) stack.push("TanStack Query")
    if (allDeps.zustand) stack.push("Zustand")
    if (allDeps["socket.io"] || allDeps["socket.io-client"]) stack.push("Socket.io")
    if (allDeps.drizzle || allDeps["drizzle-orm"]) stack.push("Drizzle ORM")
    if (allDeps.vitest || allDeps.jest) stack.push(allDeps.vitest ? "Vitest" : "Jest")
    if (allDeps.eslint) stack.push("ESLint")
    if (allDeps.prettier) stack.push("Prettier")
    if (allDeps["next-auth"] || allDeps["@auth/core"]) stack.push("Next-Auth")
    if (allDeps.shadcn || allDeps["@radix-ui"]) stack.push("shadcn/ui")
    if (allDeps["@clerk/nextjs"] || allDeps.clerk) stack.push("Clerk")
    if (allDeps["aws-sdk"] || allDeps["@aws-sdk"]) stack.push("AWS SDK")
    if (allDeps["graphql"] || allDeps["@apollo/client"]) stack.push("GraphQL")
  } catch {}

  try {
    if (fsSync.existsSync(path.join(dirPath, "turbo.json"))) {
      if (!stack.includes("Turborepo")) stack.push("Turborepo")
    }
  } catch {}

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

function readPackageJson(dirPath: string): { name?: string; private?: boolean; workspaces?: string[] } | null {
  try {
    const raw = fsSync.readFileSync(path.join(dirPath, "package.json"), "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function scanWorkspace(cwd?: string): Promise<WorkspaceInfo> {
  const startDir = cwd || process.cwd()
  const { isRepo, branch, root } = getGitInfo(startDir)
  const workspaceRoot = root || startDir
  const gitignore = await readGitignore(workspaceRoot)
  const gitignoreAtCwd = startDir !== workspaceRoot ? await readGitignore(startDir) : new Set<string>()
  const combined = new Set<string>()
  gitignore.forEach(x => combined.add(x))
  gitignoreAtCwd.forEach(x => combined.add(x))

  const [fileTree, fileCount, pkg] = await Promise.all([
    scanDir(workspaceRoot, combined, 0),
    countFiles(workspaceRoot, combined),
    Promise.resolve(readPackageJson(workspaceRoot)),
  ])

  const techStack = detectTechStack(workspaceRoot)

  const hasTsconfig = await fs.access(path.join(workspaceRoot, "tsconfig.json")).then(() => true).catch(() => false)
  const hasPrisma = await fs.access(path.join(workspaceRoot, "prisma", "schema.prisma")).then(() => true).catch(() => false)
  const isMonorepo = !!(pkg?.workspaces && pkg.workspaces.length > 0) || techStack.includes("Turborepo")

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
