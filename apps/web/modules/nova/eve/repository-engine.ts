import { canonicalSchemas, validateArguments } from "@super/agent-runtime"

export type RepositoryWorkspace = {
  execute(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
  inspectChanges(): Promise<{ digest: string; status: string; diff: string }>
  savePatch(expectedDigest: string): Promise<string>
  close(): Promise<void>
}

export type RepositoryVerification = {
  digest: string
  commands: Record<string, unknown>[]
}

export type RepositoryOperation = {
  name: string
  args: Record<string, unknown>
  validationCommands: string[]
  verified?: RepositoryVerification
}

const STANDARD_TOOLS = new Set(["read_file", "search_files", "read_instructions", "write_file", "edit_file", "run_command"])

function commandSucceeded(result: Record<string, unknown>): boolean {
  return result.success === true && result.exitCode === 0 && result.successful !== false && !result.truncated && !result.timedOut && !result.signal
}

export async function captureRepositoryState(workspace: RepositoryWorkspace): Promise<{ digest: string; status: string; diff: string }> {
  const state = await workspace.inspectChanges()
  if (typeof state.digest !== "string" || !/^[a-f0-9]{64}$/.test(state.digest) || typeof state.status !== "string" || typeof state.diff !== "string") throw new Error("Invalid repository state")
  return { digest: state.digest, status: state.status, diff: state.diff }
}

export async function executeRepositoryOperation(operation: RepositoryOperation, workspace: RepositoryWorkspace): Promise<Record<string, unknown>> {
  try {
    const { name, validationCommands, verified } = operation
    if (name === "repository_verify") {
      if (!validationCommands.length || validationCommands.length > 3 || validationCommands.some((command) => typeof command !== "string" || !command.trim())) throw new Error("One to three explicit validation commands are required")
      const before = await captureRepositoryState(workspace)
      const commands: Record<string, unknown>[] = []
      for (const command of validationCommands) {
        const result = await workspace.execute("run_command", { command, timeoutMs: 60_000, interactive: false, autoYes: false })
        commands.push({ ...result, command })
        if (!commandSucceeded(result)) return { success: false, error: "Repository validation failed or was truncated", data: { commands } }
      }
      const after = await captureRepositoryState(workspace)
      if (before.digest !== after.digest) throw new Error("Repository changed during validation; verify again")
      return { success: true, data: { verifiedDigest: after.digest, commands } }
    }
    if (name === "repository_finish") {
      if (!verified || !/^[a-f0-9]{64}$/.test(verified.digest) || !validationCommands.length || verified.commands.length !== validationCommands.length || verified.commands.some((result, index) => result.command !== validationCommands[index] || !commandSucceeded(result))) throw new Error("Successful repository verification is required")
      const state = await captureRepositoryState(workspace)
      if (state.digest !== verified.digest) throw new Error("Repository verification is stale; verify again")
      const artifact = await workspace.savePatch(verified.digest)
      return { success: true, data: { ...state, artifact } }
    }
    if (!STANDARD_TOOLS.has(name)) throw new Error("Unsupported repository tool")
    const args = validateArguments(canonicalSchemas[name]!.function.parameters, operation.args) as Record<string, unknown>
    if (name === "run_command" && (args.interactive || args.autoYes)) throw new Error("Only noninteractive commands without automatic approval are supported")
    if (name === "write_file" || name === "edit_file") {
      if (name === "edit_file" && !args.expectedVersion) throw new Error("expectedVersion is required for edits")
      const current = await workspace.execute("read_file", { path: args.path, startLine: 1, maxLines: 1 })
      if (current.success === true) {
        const data = current.data as Record<string, unknown> | undefined
        if (!args.expectedVersion || typeof data?.version !== "string" || data.version !== args.expectedVersion) throw new Error("File version changed or expectedVersion is missing; read again")
      } else {
        const missing = current.code === "ENOENT" || (typeof current.error === "string" && current.error.includes("[Errno 2] No such file or directory:"))
        if (name !== "write_file" || args.expectedVersion !== undefined || !missing) throw new Error("Cannot establish file version or safe creation")
      }
    }
    return await workspace.execute(name, args)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Repository operation failed" }
  }
}
