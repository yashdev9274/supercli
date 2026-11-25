import { expect, test } from "bun:test"
import { captureRepositoryState, executeRepositoryOperation, type RepositoryVerification, type RepositoryWorkspace } from "./repository-engine"

function fixture() {
  let revision = 1
  let exports = 0
  let race = false
  let validation: Record<string, unknown> = { success: true, exitCode: 0, truncated: false }
  let read: Record<string, unknown> = { success: true, data: { version: "v1" } }
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const digest = () => revision.toString(16).padStart(64, "0")
  const workspace: RepositoryWorkspace = {
    async execute(name, args) {
      calls.push({ name, args })
      if (name === "run_command") return validation
      if (name === "read_file") return read
      return { success: true }
    },
    async inspectChanges() { return { digest: digest(), status: "modified or untracked", diff: `patch-${revision}` } },
    async savePatch(expectedDigest) {
      if (race) revision++
      if (expectedDigest !== digest()) throw new Error("Export changed after verification")
      exports++
      return "patch-artifact"
    },
    async close() {},
  }
  return { workspace, calls, exports: () => exports, change: () => { revision++ }, race: () => { race = true }, validation: (result: Record<string, unknown>) => { validation = result }, read: (result: Record<string, unknown>) => { read = result } }
}

const operation = (name: string, args: Record<string, unknown> = {}, verified?: RepositoryVerification) => ({ name, args, validationCommands: ["validate"], verified })

async function verify(workspace: RepositoryWorkspace): Promise<RepositoryVerification> {
  const result = await executeRepositoryOperation(operation("repository_verify"), workspace)
  expect(result.success).toBe(true)
  const data = result.data as { verifiedDigest: string; commands: Record<string, unknown>[] }
  return { digest: data.verifiedDigest, commands: data.commands }
}

test("validates canonical arguments and rejects unauthorized tools", async () => {
  const f = fixture()
  expect((await executeRepositoryOperation(operation("code_exec", { code: "anything" }), f.workspace)).success).toBe(false)
  expect((await executeRepositoryOperation(operation("read_file", { path: "a", unknown: true }), f.workspace)).success).toBe(false)
  expect((await executeRepositoryOperation(operation("run_command", { command: "x", interactive: true }), f.workspace)).success).toBe(false)
  expect(f.calls).toHaveLength(0)
  expect((await executeRepositoryOperation(operation("read_file", { path: "a" }), f.workspace)).success).toBe(true)
  expect(f.calls[0]?.args).toEqual({ path: "a", startLine: 1, maxLines: 300 })
})

test("requires matching versions before editing or overwriting", async () => {
  const f = fixture()
  for (const expectedVersion of [undefined, "stale"]) {
    expect((await executeRepositoryOperation(operation("edit_file", { path: "a", oldText: "a", newText: "b", ...(expectedVersion ? { expectedVersion } : {}) }), f.workspace)).success).toBe(false)
    expect((await executeRepositoryOperation(operation("write_file", { path: "a", content: "b", ...(expectedVersion ? { expectedVersion } : {}) }), f.workspace)).success).toBe(false)
  }
  expect(f.calls.every((call) => call.name === "read_file")).toBe(true)
  expect((await executeRepositoryOperation(operation("edit_file", { path: "a", oldText: "a", newText: "b", expectedVersion: "v1" }), f.workspace)).success).toBe(true)
  expect(f.calls.at(-1)?.name).toBe("edit_file")
  expect((await executeRepositoryOperation(operation("write_file", { path: "a", content: "b", expectedVersion: "v1" }), f.workspace)).success).toBe(true)
})

test("creation requires a definite missing read, not arbitrary read failure", async () => {
  const f = fixture()
  f.read({ success: false, error: "permission denied" })
  expect((await executeRepositoryOperation(operation("write_file", { path: "a", content: "b" }), f.workspace)).success).toBe(false)
  f.read({ successful: false, error: "FileNotFoundError: [Errno 2] No such file or directory: 'a'" })
  expect((await executeRepositoryOperation(operation("write_file", { path: "a", content: "b" }), f.workspace)).success).toBe(true)
  expect(f.calls.at(-1)?.name).toBe("write_file")
  expect((await executeRepositoryOperation(operation("write_file", { path: "a", content: "b", expectedVersion: "v1" }), f.workspace)).success).toBe(false)
})

test("capture uses the injected quiesced state and rejects malformed digests", async () => {
  const f = fixture()
  expect((await captureRepositoryState(f.workspace)).diff).toBe("patch-1")
  f.workspace.inspectChanges = async () => ({ digest: "invalid", status: "", diff: "" })
  expect(captureRepositoryState(f.workspace)).rejects.toThrow("Invalid repository state")
})

test("failed, timed out, signalled and truncated commands cannot verify", async () => {
  const f = fixture()
  for (const result of [
    { success: false, exitCode: 0 },
    { success: true, exitCode: 1 },
    { success: true, exitCode: 0, truncated: true },
    { success: true, exitCode: 0, timedOut: true },
    { success: true, exitCode: 0, signal: "SIGTERM" },
  ]) {
    f.validation(result)
    expect((await executeRepositoryOperation(operation("repository_verify"), f.workspace)).success).toBe(false)
  }
  for (const validationCommands of [[], [""], ["a", "b", "c", "d"]]) {
    expect((await executeRepositoryOperation({ ...operation("repository_verify"), validationCommands }, f.workspace)).success).toBe(false)
  }
  expect(f.exports()).toBe(0)
})

test("only an injected successful verification receipt can authorize export", async () => {
  const f = fixture()
  const state = await captureRepositoryState(f.workspace)
  expect((await executeRepositoryOperation(operation("repository_finish", { verifiedDigest: state.digest }), f.workspace)).success).toBe(false)
  const verified = await verify(f.workspace)
  const finish = await executeRepositoryOperation(operation("repository_finish", {}, verified), f.workspace)
  expect(finish).toEqual({ success: true, data: { ...state, artifact: "patch-artifact" } })
  expect(f.exports()).toBe(1)
  expect(f.calls[0]?.args).toEqual({ command: "validate", timeoutMs: 60_000, interactive: false, autoYes: false })
})

test("changed files or untracked additions after verification prevent export", async () => {
  const f = fixture()
  for (let change = 0; change < 2; change++) {
    const verified = await verify(f.workspace)
    f.change()
    expect((await executeRepositoryOperation(operation("repository_finish", {}, verified), f.workspace)).success).toBe(false)
  }
  expect(f.exports()).toBe(0)
})

test("changes between the final check and actual export prevent artifact creation", async () => {
  const f = fixture()
  const verified = await verify(f.workspace)
  f.race()
  expect((await executeRepositoryOperation(operation("repository_finish", {}, verified), f.workspace)).success).toBe(false)
  expect(f.exports()).toBe(0)
})

test("validation is sequential and stops at the first failure", async () => {
  const f = fixture()
  const seen: string[] = []
  f.workspace.execute = async (_name, args) => {
    seen.push(String(args.command))
    return { success: false, exitCode: 1 }
  }
  expect((await executeRepositoryOperation({ ...operation("repository_verify"), validationCommands: ["first", "second"] }, f.workspace)).success).toBe(false)
  expect(seen).toEqual(["first"])
})

test("validation that changes repository state must be repeated", async () => {
  const f = fixture()
  f.workspace.execute = async () => {
    f.change()
    return { success: true, exitCode: 0 }
  }
  expect((await executeRepositoryOperation(operation("repository_verify"), f.workspace)).success).toBe(false)
  expect(f.exports()).toBe(0)
})
