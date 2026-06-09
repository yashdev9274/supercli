import chalk from "chalk"
import * as readline from "readline"
import boxen from "boxen"
import { theme } from "src/cli/utils/tui.ts"

export type PermissionAction = "allow" | "ask" | "deny"

interface PermissionRule {
  action: PermissionAction
  rememberAlways: boolean
}

const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf/,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /git\s+push\s+.*--force/,
  /git\s+push\s+.*-f\b/,
  /chmod\s+-R\s*777/,
  /\bsudo\b/,
  /\bdd\s+if=/,
  />\s*\/dev\/sd/,
  /mkfs\.\w+/,
  /:()\s*\{.*:\s*\}.*:/,
  /curl\s+.*\|\s*bash/,
  /wget\s+.*\|\s*bash/,
  /\\x[0-9a-fA-F]{2}.*;.*;.*;/,
  /pkill\s+-9/,
  /killall\s+/,
  /shutdown\s+now/,
  /reboot\b/,
  /init\s+0/,
  /init\s+6/,
]

const DEFAULT_RULES: Record<string, PermissionRule> = {
  read_file: { action: "allow", rememberAlways: false },
  search_files: { action: "allow", rememberAlways: false },
  url_fetch: { action: "allow", rememberAlways: false },
  web_search: { action: "allow", rememberAlways: false },
  code_exec: { action: "ask", rememberAlways: true },
  write_file: { action: "ask", rememberAlways: true },
  run_command: { action: "ask", rememberAlways: true },
}

export class PermissionManager {
  private rules: Map<string, PermissionRule>
  private alwaysCache: Map<string, Set<string>> = new Map()
  private sessionLevel: "allow" | "ask" | "deny" | null = null

  constructor() {
    this.rules = new Map(Object.entries(DEFAULT_RULES))
  }

  setSessionLevel(level: "allow" | "ask" | "deny"): void {
    this.sessionLevel = level
  }

  getSessionLevel(): "allow" | "ask" | "deny" | null {
    return this.sessionLevel
  }

  isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (this.sessionLevel === "allow") return true
    if (this.sessionLevel === "deny") return false

    const rule = this.rules.get(toolName)
    if (!rule || rule.action === "allow") return true
    if (rule.action === "deny") return false

    if (rule.rememberAlways && this.isAlwaysAllowed(toolName, args)) {
      return true
    }

    const isDangerous = toolName === "run_command" && this.isDangerousCommand(String(args.command || ""))

    return this.promptUser(toolName, args, isDangerous, rule.rememberAlways)
  }

  private isAlwaysAllowed(toolName: string, args: Record<string, unknown>): boolean {
    const cache = this.alwaysCache.get(toolName)
    if (!cache) return false

    if (toolName === "run_command") {
      const command = String(args.command || "")
      for (const prefix of cache) {
        if (command.startsWith(prefix)) return true
      }
      return false
    }

    if (toolName === "write_file") {
      const path = String(args.path || "")
      for (const pattern of cache) {
        if (path.startsWith(pattern)) return true
        if (pattern.endsWith("/*") && path.startsWith(pattern.slice(0, -2))) return true
      }
      return false
    }

    return false
  }

  private addAlwaysCache(toolName: string, args: Record<string, unknown>, alwaysPattern: string): void {
    if (!this.alwaysCache.has(toolName)) {
      this.alwaysCache.set(toolName, new Set())
    }
    this.alwaysCache.get(toolName)!.add(alwaysPattern)
  }

  private async promptUser(
    toolName: string,
    args: Record<string, unknown>,
    isDangerous: boolean,
    canRememberAlways: boolean,
  ): Promise<boolean> {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw

    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }

    const borderColor = isDangerous ? theme.red : theme.warning
    const header = isDangerous ? " DANGEROUS OPERATION " : " Permission Request "

    let content = ""
    if (toolName === "write_file") {
      content = `Supercode wants to write:\n  ${chalk.cyan(String(args.path || ""))}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
    } else if (toolName === "run_command") {
      content = `Run:\n  $ ${chalk.cyan(String(args.command || ""))}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
    } else if (toolName === "code_exec") {
      const code = String(args.code || "")
      const preview = code.length > 80 ? code.slice(0, 77) + "..." : code
      content = `Execute code:\n  ${chalk.cyan(preview)}`
    }

    if (isDangerous) {
      content += `\n\n${chalk.red("This operation is potentially destructive.")}`
    }

    const box = boxen(content, {
      title: header,
      borderColor,
      padding: 1,
      margin: 1,
    })
    console.log(box)

    return new Promise((resolve) => {
      const rl = readline.createInterface({ input: stdin, output: process.stdout })

      const prompt = isDangerous
        ? "Allow this operation? (y/N): "
        : canRememberAlways
          ? "[y] Once  [a] Always for session  [n] Deny: "
          : "Allow? (y/N): "

      rl.question(prompt, (answer) => {
        rl.close()

        if (stdin.isTTY && wasRaw) {
          stdin.setRawMode(true)
        }

        const a = answer.trim().toLowerCase()

        if (a === "y" || a === "yes") {
          resolve(true)
        } else if ((a === "a" || a === "always") && canRememberAlways && !isDangerous) {
          let alwaysPattern = "*"
          if (toolName === "run_command") {
            const cmd = String(args.command || "")
            const parts = cmd.split(/\s+/)
            if (parts.length > 0) {
              alwaysPattern = parts[0] + " "
            }
          } else if (toolName === "write_file") {
            const path = String(args.path || "")
            const lastSlash = path.lastIndexOf("/")
            alwaysPattern = lastSlash >= 0 ? path.slice(0, lastSlash + 1) : ""
          }
          this.addAlwaysCache(toolName, args, alwaysPattern)
          resolve(true)
        } else {
          resolve(false)
        }
      })
    })
  }
}

export const permissionManager = new PermissionManager()
