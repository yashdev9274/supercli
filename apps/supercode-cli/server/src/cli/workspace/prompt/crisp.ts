/** Supercode Crisp simplicity ladder (from cli-config). */
import fs from "fs"
import path from "path"
import os from "os"

export function crispSection(): string[] {
  const configPath = path.join(os.homedir(), ".config", "supercode", "cli-config.json")
  let mode = "off"
  try {
    const data = fs.readFileSync(configPath, "utf-8")
    const config = JSON.parse(data)
    if (["off", "lite", "full", "ultra"].includes(config.crispMode)) {
      mode = config.crispMode
    }
  } catch {
    /* no config */
  }
  if (mode === "off") return []

  const intensity: Record<string, string> = {
    lite: "Apply these principles as helpful guidelines — prefer simplicity but don't over-enforce.",
    full: "Apply these principles as binding constraints. Every abstraction, dependency, and pattern must be justified against this ladder.",
    ultra: "Enforce these principles as hard constraints. The burden of proof is on the developer adding any complexity.",
  }

  const lines: string[] = [
    "",
    `## Supercode Crisp (${mode}) — The Simplicity Ladder`,
    "",
    intensity[mode] ?? "",
    "",
    "When writing or reviewing code, evaluate EVERY design decision against this ladder from top to bottom:",
    "",
    "1. **YAGNI** — You Aren't Gonna Need It. If it's not needed right now, don't build it. No future-proofing, no speculative abstractions.",
    "   → Tag: [crisp:1]",
    "",
    "2. **Reuse what exists** — Before writing anything new, check if the language/stdlib/project already has it. Copy-paste-modify beats import-a-library.",
    "   → Tag: [crisp:2]",
    "",
    "3. **Standard library first** — Use built-in APIs over third-party packages. OS features over npm/crates/pip.",
    "   → Tag: [crisp:3]",
    "",
    "4. **Native platform APIs** — Prefer OS/platform built-ins over userland solutions. Shell over Python. CSS over JS. HTML over framework.",
    "   → Tag: [crisp:4]",
    "",
    "5. **Dependencies are debt** — Every dependency is a liability. Before adding one: can you inline it? Can you strip it? Can you replace 50 lines of deps with 10 lines of code?",
    "   → Tag: [crisp:5]",
    "",
    "6. **One line > many** — If you can express the logic in a single expression, do it. Each temporary variable is a concept the reader must hold in working memory.",
    "   → Tag: [crisp:6]",
    "",
    "7. **Minimum code to satisfy the spec** — The best code is the code you didn't write. Delete unused imports. Remove dead branches.",
    "   → Tag: [crisp:7]",
    "",
    "### How to apply",
    "- When reviewing code, reference the rung number: [crisp:3] use URL constructor instead of parsing manually",
    "- When adding an abstraction, ask: which rung of the ladder does this serve?",
    "- When you see over-engineering, tag it: [crisp:1] YAGNI — this config system supports use cases that don't exist yet",
    "- Tag ALL findings with [crisp:N] so the debt tracker can find them later",
    "",
  ]

  if (mode === "ultra") {
    lines.push(
      "### Ultra mode additions",
      "- No new npm/crates/pip dependencies without explicit approval",
      "- No new types/interfaces unless the function signature would be ambiguous without them",
      "- No new files unless the existing file exceeds 400 lines",
      "- Any abstraction must prove it eliminates more code than it adds (negative LoC)",
      "",
    )
  }
  return lines
}
