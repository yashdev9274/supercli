import chalk from "chalk"
import * as readline from "readline"
import boxen from "boxen"
import { theme } from "src/cli/utils/tui.ts"
import type { RulesetArray } from "src/permission"
import { agentService } from "src/agent"

// ---- Types ----
//
// We use the unified `RulesetArray` shape from src/permission/index.ts
// ({ permission, pattern, action, reason? }) — same shape as the
// AgentInfo.permission rulesets, so agent rules can be merged directly.

export type Effect = "allow" | "deny" | "ask"

type Reply = "once" | "always" | "reject"

interface PendingRequest {
  id: string
  action: string
  resource: string
  agent?: string
  resolve: (value: boolean) => void
  reject: () => void
}

/**
 * A strategy for asking the user whether a tool call should be allowed.
 *
 * The chat loop registers its own prompt function that uses the existing
 * keypress handler (so the user's keystrokes are captured reliably while
 * the permission prompt is on-screen). When no function is registered,
 * the manager falls back to the default `readline`-based prompt — which
 * works for non-TTY callers (tests, server-side invocations).
 */
export type PermissionPromptRequest = {
  toolName: string
  resource: string
  args: Record<string, unknown>
  isDangerous: boolean
}

export type PermissionPromptReply = "once" | "always" | "reject"

export type PermissionPromptFunction = (
  req: PermissionPromptRequest,
) => Promise<PermissionPromptReply>

// ---- Wildcard matching (from opencode) ----

function wildcardMatch(input: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  return new RegExp("^" + escaped + "$", "s").test(input)
}

// ---- Evaluate: find last matching rule (opencode pattern) ----

function findLastMatch(
  action: string,
  resource: string,
  ruleset: RulesetArray,
): { effect: Effect; reason?: string } | undefined {
  let match: { effect: Effect; reason?: string } | undefined
  for (const rule of ruleset) {
    if (
      wildcardMatch(action, rule.permission) &&
      wildcardMatch(resource, rule.pattern)
    ) {
      match = { effect: rule.action, reason: rule.reason }
    }
  }
  return match
}

function evaluate(
  action: string,
  resource: string,
  ...rulesets: RulesetArray[]
): { effect: Effect; reason?: string } {
  const merged = rulesets.flat()
  return (
    findLastMatch(action, resource, merged) ?? {
      effect: "ask",
    }
  )
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
//
// Uses the unified RulesetArray shape so agent rulesets merge seamlessly.
// Read-only tools are allow; write/exec are ask; orchestration tools
// (task, delegate, switch_to_agent_mode) are allow because they gate
// their own actions.

const READONLY_COMMAND_PATTERNS: string[] = [
  // Git read-only commands
  "git status*",
  "git log*",
  "git diff*",
  "git show*",
  "git branch*",
  "git stash*",
  "git remote*",
  "git tag*",
  "git config*",
  "git ls-*",
  "git shortlog*",
  "git describe*",
  "git grep*",
  "git blame*",
  "git whatchanged*",
  "git rev-*",
  "git name-rev*",
  "git cherry*",
  "git bisect visualize*",
  "git reflog*",
  "git worktree list*",
  "git submodule status*",
  "git clean -n*",
  "git check-ignore*",
  "git hash-object*",
  "git cat-file*",
  "git count-objects*",
  "git var*",
  "git version",
  "git verify-*",
  "git help*",

  // Shell read-only commands
  "ls*",
  "cat *",
  "pwd",
  "which *",
  "head *",
  "tail *",
  "wc *",
  "echo *",
  "find *",
  "grep *",
  "rg *",
  "ack *",
  "ag *",
  "type *",
  "file *",
  "stat *",
  "du *",
  "df *",
  "env",
  "export",
  "printenv*",
  "date",
  "cal",
  "uptime",
  "uname*",
  "whoami",
  "id",
  "hostname",
  "arch",
  "sysctl*",
  "tree*",
  "dirname *",
  "basename *",
  "realpath*",
  "readlink*",
  "sort *",
  "uniq *",
  "cut *",
  "tr *",
  "od *",
  "hexdump*",
  "xxd *",
  "nl *",
  "pr *",
  "fold *",
  "expand *",
  "unexpand *",
  "yes *",
  "seq *",
  "tsort *",
  "comm *",
  "diff *",
  "sdiff *",
  "cmp *",
  "patch --dry-run*",
  "patch -C*",
  "patch --check*",
  "mkfifo *",
  "pipenv --venv",
  "poetry env info*",
  "cargo metadata*",
  "cargo tree*",
  "bun pm *",
  "npm ls*",
  "npm pack --dry-run*",
  "yarn info*",
  "pnpm ls*",
  "pip list*",
  "pip show*",
  "pip freeze*",
  "pipdeptree*",
  "gem list*",
  "gem contents*",
  "gem specification*",
  "bundle list*",
  "bundle show*",
  "bundle viz*",
  "mix deps*",
  "mix hex*",
  "go list*",
  "go doc*",
  "go vet*",
  "go version",
  "cargo check*",
  "cargo doc*",
  "cargo clippy*",
  "cargo fmt --check*",
  "rustup show*",
  "rustup toolchain list*",
  "rustc --version*",
  "node -e *",
  "node --version",
  "node --eval *",
  "node --print *",
  "npm --version",
  "npx --version",
  "tsc --noEmit*",
  "tsc --version",
  "eslint --print-config*",
  "prettier --check*",
  "stylelint --version",

  // GitHub CLI read-only
  "gh pr view*",
  "gh issue view*",
  "gh repo list*",
  "gh search*",
  "gh api *",
  "gh release list*",
  "gh run list*",
  "gh status*",

  // Docker read-only
  "docker ps*",
  "docker images*",
  "docker inspect*",
  "docker logs*",
  "docker info*",
  "docker version",
  "docker network ls*",
  "docker volume ls*",
  "docker stats*",

  // Podman read-only (mirrors docker)
  "podman ps*",
  "podman images*",
  "podman inspect*",
  "podman logs*",
  "podman info*",
  "podman version",

  // Kubernetes read-only
  "kubectl get*",
  "kubectl describe*",
  "kubectl logs*",
  "kubectl top*",
  "kubectl api-resources*",
  "kubectl api-versions",
  "kubectl explain*",
  "kubectl version",

  // Process diagnostics
  "ps *",
  "lsof*",
  "netstat*",
  "ss *",
  "top -l*",
  "vm_stat*",
  "iostat*",
  "sar*",

  // Package/system introspection
  "man *",
  "apropos *",
  "whatis *",
  "brew list*",
  "brew search*",
  "brew info*",
  "brew deps*",
  "brew outdated",
  "apt list*",
  "apt-cache *",
  "dnf list*",
  "dnf info*",
  "dpkg -l*",
  "dpkg --list*",
  "nix-env -q*",
  "nix search*",
  "nix show*",
  "sw_vers",
  "system_profiler*",

  // Network diagnostics (read-only)
  "dig*",
  "nslookup*",
  "host *",
  "ping -c *",
  "traceroute*",
  "whois*",
]

const DEFAULT_RULES: RulesetArray = [
  // Read-only tools: always allowed
  { permission: "read_file", pattern: "*", action: "allow" },
  { permission: "search_files", pattern: "*", action: "allow" },
  { permission: "url_fetch", pattern: "*", action: "allow" },
  { permission: "web_search", pattern: "*", action: "allow" },
  { permission: "read_instructions", pattern: "*", action: "allow" },
  { permission: "todo_read", pattern: "*", action: "allow" },
  { permission: "todo_write", pattern: "*", action: "allow" },
  { permission: "task", pattern: "*", action: "allow" },
  { permission: "delegate", pattern: "*", action: "allow" },
  { permission: "switch_to_agent_mode", pattern: "*", action: "allow" },

  // Write/execute tools: ask by default (catch-alls come FIRST so specific
  // read-only patterns below override them via findLastMatch — later wins).
  { permission: "write_file", pattern: "*", action: "ask" },
  { permission: "edit_file", pattern: "*", action: "ask" },
  { permission: "run_command", pattern: "*", action: "ask" },
  { permission: "code_exec", pattern: "*", action: "ask" },

  // Read-only git and shell commands: auto-allowed (override the catch-all
  // above via findLastMatch — later rules win).
  ...READONLY_COMMAND_PATTERNS.map((p) => ({
    permission: "run_command" as const,
    pattern: p,
    action: "allow" as const,
  })),
]

// ---- In-memory saved rules (persisted for the session) ----

let sessionSavedRules: RulesetArray = []

// ---- Current-agent and parent-agent thread-local ----
//
// Wrapped tools set these so permissionManager.check() can scope its
// ruleset to the calling agent chain (agent + its parent) without
// having to thread agentName through every call site.
let currentAgent: string | undefined = undefined
let parentAgent: string | undefined = undefined

export function setCurrentAgent(name: string | undefined): void {
  currentAgent = name
}

export function getCurrentAgent(): string | undefined {
  return currentAgent
}

export function setParentAgent(name: string | undefined): void {
  parentAgent = name
}

export function getParentAgent(): string | undefined {
  return parentAgent
}

// ---- Resource extraction ----

function getResource(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "write_file":
      return String(args.path || "")
    case "edit_file":
      return String(args.path || "")
    case "run_command":
      return String(args.command || "")
    case "code_exec":
      return String(args.code || "").slice(0, 80)
    default:
      return String(args.path || args.command || args.pattern || "*")
  }
}

export interface PermissionCheckOptions {
  agentName?: string
}

// ---- PermissionManager ----

export class PermissionManager {
  private pendingRequests: Map<string, PendingRequest> = new Map()
  private requestCounter = 0
  private sessionLevel: "allow" | "deny" | "ask" | null = null
  private promptFn: PermissionPromptFunction | null = null

  setSessionLevel(level: "allow" | "deny" | "ask" | null): void {
    this.sessionLevel = level
  }

  getSessionLevel(): "allow" | "deny" | "ask" | null {
    return this.sessionLevel
  }

  /**
   * Register a prompt strategy. The chat loop registers its own (which
   * uses the keypress handler); tests can register a stub; the default
   * is a `readline`-based prompt for non-TTY environments.
   */
  setPromptFunction(fn: PermissionPromptFunction | null): void {
    this.promptFn = fn
  }

  isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command))
  }

  async check(
    toolName: string,
    args: Record<string, unknown>,
    opts: PermissionCheckOptions = {},
  ): Promise<boolean> {
    // 1. Session-level override
    if (this.sessionLevel === "allow") return true
    if (this.sessionLevel === "deny") return false

    // 2. Extract resource
    const resource = getResource(toolName, args)

    // 3. Resolve agent ruleset (if a subagent is the caller).
    //    If a parent agent is set, merge parent + child rules so the
    //    parent's DENY always overrides the child's ALLOW.
    const resolvedAgent = opts.agentName ?? currentAgent
    const resolvedParent = parentAgent
    let agentRuleset: RulesetArray | undefined

    if (resolvedAgent && resolvedParent) {
      // Merge parent + child with parent-deny inheritance
      const childRules = agentService.get(resolvedAgent)?.info.permission
      const parentRules = agentService.get(resolvedParent)?.info.permission
      if (childRules || parentRules) {
        const { mergeParentChildPermissions } = await import("src/agent/subagent-permissions")
        agentRuleset = mergeParentChildPermissions(childRules, parentRules)
      }
    } else if (resolvedAgent) {
      agentRuleset = agentService.get(resolvedAgent)?.info.permission
    }

    // 4. Evaluate rules — order matters (later rules override earlier,
    //    via findLast):
    //    1. DEFAULT_RULES (broad: "write_file → ask", "read_file → allow")
    //    2. agent ruleset (specific overrides — `*` catch-all means
    //       "allow everything the agent has no specific rule for")
    //    3. sessionSavedRules (user's "always" grants win over agent)
    const allRules: RulesetArray = [
      ...DEFAULT_RULES,
      ...(agentRuleset ?? []),
      ...sessionSavedRules,
    ]
    const rule = evaluate(toolName, resource, allRules)

    // 5. Short-circuit
    if (rule.effect === "allow") return true
    if (rule.effect === "deny") return false

    // 6. Ask the user (only top-level agent prompts; subagent failures
    //    just deny silently to avoid spamming the user mid-task)
    const isDangerous = toolName === "run_command" && this.isDangerousCommand(resource)
    if (resolvedAgent) {
      return false
    }
    return this.promptUser(toolName, resource, args, isDangerous)
  }

  private promptUser(
    toolName: string,
    resource: string,
    args: Record<string, unknown>,
    isDangerous: boolean,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const id = `req_${++this.requestCounter}`
      this.pendingRequests.set(id, {
        id,
        action: toolName,
        resource,
        resolve,
        reject: () => resolve(false),
      })

      const replyHandler = (reply: PermissionPromptReply) => {
        this.pendingRequests.delete(id)
        if (reply === "once") {
          this.onReplied(toolName, resource, "once")
          resolve(true)
        } else if (reply === "always") {
          sessionSavedRules.push({
            permission: toolName,
            pattern: this.alwaysPattern(toolName, resource),
            action: "allow",
          })
          this.onReplied(toolName, resource, "always")
          resolve(true)
        } else {
          this.onReplied(toolName, resource, "reject")
          resolve(false)
        }
      }

      // If a prompt function is registered (chat loop, tests, ...), delegate
      // to it. Otherwise fall back to the default `readline` prompt that
      // works in non-TTY environments.
      if (this.promptFn) {
        this.promptFn({
          toolName,
          resource,
          args,
          isDangerous,
        }).then(replyHandler)
        return
      }

      // Default path: non-TTY, server-side, or tests without a registered fn.
      this.renderReadlinePrompt(
        toolName,
        resource,
        args,
        isDangerous,
        replyHandler,
      )
    })
  }

  /**
   * Render the permission box via boxen (same UI as the chat-loop
   * registered prompt) and capture a single y/a/n answer via raw readline.
   *
   * This is the fallback for environments where no prompt function has
   * been registered. The chat loop registers its own so this path is
   * mostly hit by tests + non-TTY callers.
   *
   * If stdin is not a TTY (test environments, server-side), we don't
   * block waiting for input — we reject immediately and emit a clear
   * warning. Callers that need to handle non-interactive flows should
   * register a prompt function explicitly.
   */
  private renderReadlinePrompt(
    toolName: string,
    resource: string,
    args: Record<string, unknown>,
    isDangerous: boolean,
    onReply: (reply: PermissionPromptReply) => void,
  ) {
    const stdin = process.stdin

    // Non-interactive fallback: don't hang waiting for stdin. Caller
    // should have registered a prompt function for real interactions.
    if (!stdin.isTTY) {
      console.warn(
        `[permission-manager] No prompt function registered and stdin is not a TTY; denying ${toolName}(${resource})`,
      )
      onReply("reject")
      return
    }

    const wasRaw = stdin.isRaw
    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }

    const borderColor = isDangerous ? theme.red : theme.amber
    const header = isDangerous ? " DANGEROUS OPERATION " : " Permission Request "

    let content = ""
    if (toolName === "write_file") {
      content = `Supercode wants to write:\n  ${chalk.cyan(resource)}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
    } else if (toolName === "edit_file") {
      content = `Edit:\n  ${chalk.cyan(resource)}`
      if (args.description) {
        content += `\n  ${chalk.dim(String(args.description))}`
      }
      if (args.oldText) {
        const preview = String(args.oldText).slice(0, 60)
        content += `\n  Replacing: ${chalk.dim(preview)}${preview.length >= 60 ? "…" : ""}`
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
        onReply("once")
      } else if ((a === "a" || a === "always") && !isDangerous) {
        onReply("always")
      } else {
        onReply("reject")
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

  private onReplied(action: string, resource: string, reply: Reply): void {
    if (reply === "always") {
      const allRules: RulesetArray = [...DEFAULT_RULES, ...sessionSavedRules]
      for (const [id, pending] of this.pendingRequests) {
        if (pending.action !== action) continue
        const rule = evaluate(pending.action, pending.resource, allRules)
        if (rule.effect === "allow") {
          pending.resolve(true)
          this.pendingRequests.delete(id)
        }
      }
    }
    // (no-op)

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