import { beforeEach, expect, mock, test } from "bun:test"

const source = { repositoryFullName: "fork/repo", branch: "feature/topic", sha: "a".repeat(40) }
let head = source.sha
let retained: Record<string, unknown> | null = null
const commands: string[][] = []
const updates: Array<Record<string, unknown>> = []
const db = {
  $executeRaw: async () => 0,
  novaSandboxSession: {
    count: async () => 0,
    findUnique: async () => retained,
    create: async () => ({ id: "registry" }),
    updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 } },
  },
  agentRun: { update: async () => ({}) },
  novaUsageLedger: { upsert: async () => ({}) },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}
mock.module("@super/db", () => ({ default: db }))
mock.module("@/modules/github/lib/github", () => ({ getGithubTokenForUser: async () => "fixture" }))
mock.module("./billing", () => ({ reserveSandboxCredits: async () => ({ cancel: async () => {}, settle: async () => {} }), recoverSandboxCredits: async () => {} }))
const sandbox = {
  update: async () => {},
  stop: async () => {},
  currentSession: () => ({ sessionId: "provider-session" }),
  runCommand: async (input: { args: string[] }) => {
    commands.push(input.args)
    return {
      async *logs() { yield { stream: "stdout", data: input.args[0] === "rev-parse" ? head : "" } },
      wait: async () => ({ exitCode: 0 }),
      kill: async () => {},
    }
  },
}
mock.module("@vercel/sandbox", () => ({ APIError: class extends Error {}, Sandbox: class { static create = async () => sandbox } }))
const { openSandboxWorkspace } = await import("./service")
const input = () => ({ userId: "u", organizationId: "org", sessionId: "s", runId: "r", repositoryFullName: source.repositoryFullName, githubSource: source, signal: new AbortController().signal })

beforeEach(() => { commands.length = 0; updates.length = 0; retained = null; head = source.sha })

test("Vercel fetches and detaches at the exact resolved commit", async () => {
  const workspace = await openSandboxWorkspace(input())
  expect(commands.some((args) => args.includes("fetch") && args.at(-1) === source.sha)).toBe(true)
  expect(commands.some((args) => args.includes("checkout") && args.includes("--detach") && args.at(-1) === source.sha)).toBe(true)
  expect(updates.some((data) => data.baseSha === source.sha && data.branch === source.branch)).toBe(true)
  await workspace.close()
})

test("a mismatched checkout fails instead of running on the default branch", async () => {
  head = "b".repeat(40)
  await expect(openSandboxWorkspace(input())).rejects.toThrow("could not be prepared")
  expect(updates.some((data) => data.status === "running")).toBe(false)
})

test("retained workspaces with a different source fail before provider acquisition", async () => {
  retained = { id: "registry", expiresAt: new Date(Date.now() + 60_000), baseSha: "b".repeat(40), branch: source.branch }
  await expect(openSandboxWorkspace(input())).rejects.toThrow("does not match")
  expect(commands).toHaveLength(0)
  await expect(openSandboxWorkspace({ ...input(), repositoryFullName: "upstream/repo" })).rejects.toThrow("immutable")
})
