import { homedir } from "node:os"
import { join, resolve } from "node:path"

export type CodexProfileMode = "existing" | "isolated"

export function resolveCodexProfile(mode: string, configuredHome = process.env.CODEX_HOME, home = homedir()) {
  if (mode !== "existing" && mode !== "isolated") throw new Error("Profile must be existing or isolated")
  const directory = mode === "isolated"
    ? join(home, ".nova-codex")
    : configuredHome?.trim() || join(home, ".codex")
  const path = directory === "~" ? home : directory.startsWith("~/") ? join(home, directory.slice(2)) : resolve(directory)
  return { mode: mode as CodexProfileMode, path }
}
