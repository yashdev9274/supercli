import chalk from "chalk"
import * as readline from "readline"
import boxen from "boxen"
import { theme } from "src/cli/utils/tui.ts"

// ---- Types (aligned with opencode) ----

export type Effect = "allow" | "deny" | "ask"

export interface Rule {
  action: string
  resource: string
  effect: Effect
}

export type Ruleset = Rule[]

export type Reply = "once" | "always" | "reject"

interface PendingRequest {
  id: string
  action: string
  resource: string
  resolve: (value: boolean) => void
  reject: () => void
}

// ---- Wildcard matching (from opencode) ----

function wildcardMatch(input: string, pattern: string): boolean {
  let escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  return new RegExp("^" + escaped + "$", "s").test(input)
}

// ---- Evaluate: find last matching rule (opencode pattern) ----

function evaluate(action: string, resource: string, ...rulesets: Ruleset[]): Rule {
  const match = rulesets
    .flat()
    .findLast(
      (rule) => wildcardMatch(action, rule.action) && wildcardMatch(resource, rule.resource),
    )

  return match ?? { action, resource: "*", effect: "ask" }
}

// ---- Dangerous patterns ----

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

// ---- Default rulesets ----

const DEFAULT_RULES: Ruleset = [
  // Read-only tools: always allowed
  { action: "read_file", resource: "*", effect: "allow" },
  { action: "search_files", resource: "*", effect: "allow" },
  { action: "url_fetch", resource: "*", effect: "allow" },
  { action: "web_search", resource: "*", effect: "allow" },
  { action: "read_instructions", resource: "*", effect: "allow" },
  { action: "todo_read", resource: "*", effect: "allow" },
  { action: "todo_write", resource: "*", effect: "allow" },

  // Write/execute tools: ask by default
  { action: "write_file", resource: "*", effect: "ask" },
  { action: "run_command", resource: "*", effect: "ask" },
  { action: "code_exec", resource: "*", effect: "ask" },
]

// ---- In-memory saved rules (persisted for the session) ----

let sessionSavedRules: Ruleset = []

// ---- Resource extraction ----

function getResource(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "write_file":
      return String(args.path || "")
    case "run_command":
      return String(args.command || "")
    case "code_exec":
      return String(args.code || "").slice(0, 80)
    default:
      return String(args.path || args.command || args.pattern || "*")
  }
}

// ---- PermissionManager ----

export class PermissionManager {
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestCounter = 0
  private sessionLevel: "allow" | "deny" | "ask" | null = null

  setSessionLevel(level: "allow" | "deny" | "ask" | null): void {
    this.sessionLevel = level
  }

  getSessionLevel(): "allow" | "deny" | "ask" | null {
    return this.sessionLevel
  }

  isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
  }

  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    // 1. Session-level override
    if (this.sessionLevel === "allow") return true
    if (this.sessionLevel === "deny") return false

    // 2. Extract resource
    const resource = getResource(toolName, args)

    // 3. Evaluate rules (opencode pattern: findLast match)
    const allRules: Ruleset = [...DEFAULT_RULES, ...sessionSavedRules]
    const rule = evaluate(toolName, resource, allRules)

    // 4. Short-circuit
    if (rule.effect === "allow") return true
    if (rule.effect === "deny") return false

    // 5. Ask the user
    const isDangerous = toolName === "run_command" && this.isDangerousCommand(resource)
    return this.promptUser(toolName, resource, args, isDangerous)
  }

  private promptUser(
    toolName: string,
    resource: string,
    args: Record<string, unknown>,
    isDangerous: boolean,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestCounter}`

      this.pendingRequests.set(id, {
        id,
        action: toolName,
        resource,
        resolve,
        reject: () => {
          resolve(false)
        },
      })

      this.renderPrompt(toolName, resource, args, isDangerous, id, resolve)
    })
  }

  private renderPrompt(
    toolName: string,
    resource: string,
    args: Record<string, unknown>,
    isDangerous: boolean,
    requestId: string,
    resolve: (value: boolean) => void,
  ) {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw

    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }

    const borderColor = isDangerous ? theme.red : theme.warning
    const header = isDangerous ? " DANGEROUS OPERATION " : " Permission Request "

    let content = ""
    if (toolName === "write_file") {
      content = `Supercode wants to write:\n  ${chalk.cyan(resource)}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
    } else if (toolName === "run_command") {
      content = `Run:\n  $ ${chalk.cyan(resource)}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
    } else if (toolName === "code_exec") {
      const preview = resource.length > 80 ? resource.slice(0, 77) + "..." : resource
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

    const rl = readline.createInterface({ input: stdin, output: process.stdout })

    const prompt = isDangerous
      ? "Allow this operation? (y/N): "
      : "[y] Once  [a] Always for session  [n] Deny: "

    rl.question(prompt, (answer) => {
      rl.close()

      if (stdin.isTTY && wasRaw) {
        stdin.setRawMode(true)
      }

      const a = answer.trim().toLowerCase()

      if (a === "y" || a === "yes") {
        this.pendingRequests.delete(requestId)
        this.onReplied(toolName, resource, "once")
        resolve(true)
      } else if ((a === "a" || a === "always") && !isDangerous) {
        // Save as "always allow" rule for this action+resource pattern
        sessionSavedRules.push({ action: toolName, resource: this.alwaysPattern(toolName, resource), effect: "allow" })
        this.pendingRequests.delete(requestId)
        this.onReplied(toolName, resource, "always")
        resolve(true)
      } else {
        this.pendingRequests.delete(requestId)
        this.onReplied(toolName, resource, "reject")
        resolve(false)
      }
    })
  }

  private alwaysPattern(toolName: string, resource: string): string {
    if (toolName === "run_command") {
      const parts = resource.split(/\s+/)
      return (parts[0] ?? "") + " *"
    }
    if (toolName === "write_file") {
      const lastSlash = resource.lastIndexOf("/")
      return lastSlash >= 0 ? resource.slice(0, lastSlash + 1) + "*" : "*"
    }
    return resource
  }

  // ---- Cascade (opencode pattern) ----
  // When a user says "always allow", auto-approve pending requests
  // that also match the saved rules.
  // When a user says "reject", reject all pending requests for this tool.

  private onReplied(action: string, resource: string, reply: Reply): void {
    if (reply === "always") {
      const allRules: Ruleset = [...DEFAULT_RULES, ...sessionSavedRules]
      for (const [id, pending] of this.pendingRequests) {
        if (pending.action !== action) continue
        const rule = evaluate(pending.action, pending.resource, allRules)
        if (rule.effect === "allow") {
          pending.resolve(true)
          this.pendingRequests.delete(id)
        }
      }
    }

    if (reply === "reject") {
      for (const [id, pending] of this.pendingRequests) {
        if (pending.action !== action) continue
        pending.reject()
        this.pendingRequests.delete(id)
      }
    }
  }
}

export const permissionManager = new PermissionManager()
