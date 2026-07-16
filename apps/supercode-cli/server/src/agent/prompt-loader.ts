import { readFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROMPTS_DIR = path.resolve(__dirname, "prompts")

export function promptPath(name: string): string {
  return path.join(PROMPTS_DIR, `${name}.txt`)
}

export function promptExists(name: string): boolean {
  return existsSync(promptPath(name))
}

export async function loadPrompt(name: string): Promise<string | undefined> {
  const p = promptPath(name)
  if (!existsSync(p)) return undefined
  try {
    return await readFile(p, "utf-8")
  } catch {
    return undefined
  }
}

/**
 * Synchronous variant for hot paths (system prompt construction).
 * Falls back to undefined if the file is missing.
 */
export function loadPromptSync(name: string): string | undefined {
  const p = promptPath(name)
  if (!existsSync(p)) return undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").readFileSync(p, "utf-8") as string
  } catch {
    return undefined
  }
}

/**
 * List all available prompt names (without .txt extension).
 * Returns names in sorted order. Useful for validation and debugging.
 */
export async function listPrompts(): Promise<string[]> {
  try {
    const files = await readdir(PROMPTS_DIR)
    const names: string[] = []
    for (const f of files) {
      if (f.endsWith(".txt")) names.push(f.replace(/\.txt$/, ""))
    }
    return names.sort()
  } catch {
    return []
  }
}