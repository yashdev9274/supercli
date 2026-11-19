import { afterEach, describe, expect, test } from "bun:test"
import { parseWorkspaceArgs } from "./cli"
import { approvedWorkspaceOrigin, startWorkspaceCompanion, type WorkspaceService } from "./server"

const origin = "http://localhost:3003"
const otherOrigin = "https://nova.example"
const running: ReturnType<typeof startWorkspaceCompanion>[] = []
afterEach(() => { for (const companion of running.splice(0)) companion.stop() })

function fixture() {
  const calls: { method: string; args: unknown[] }[] = []
  const call = (method: string, result: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args })
    return result
  }
  const service: WorkspaceService = {
    listProjects: call("listProjects", [{ id: "project", path: "/explicit-root" }]),
    cloneRepository: call("cloneRepository", { id: "cloned-project" }),
    lookup: call("lookup", { id: "workspace" }),
    branches: call("branches", ["main"]),
    worktrees: call("worktrees", [{ path: "/explicit-root", branch: "main", head: "a".repeat(40), main: true, locked: false, prunable: false }]),
    fetchBranches: call("fetchBranches", ["main", "origin/topic"]),
    ignoredFiles: call("ignoredFiles", [".env.local"]),
    create: call("create", { id: "workspace" }),
    get: call("get", { id: "workspace" }),
    files: call("files", ["src/index.ts"]),
    read: call("read", "hello"),
    write: call("write", undefined),
    status: call("status", { clean: true }),
    preview: call("preview", { id: "preview" }),
    publish: call("publish", { ok: true }),
    initialize: call("initialize", { id: "project" }),
  }
  const companion = startWorkspaceCompanion({ roots: ["/explicit-root"], origins: [origin, otherOrigin], port: 0, service })
  running.push(companion)
  const address = `http://127.0.0.1:${companion.server.port}`
  const post = (path: string, body: unknown, token?: string, requestOrigin = origin) => fetch(address + path, {
    method: "POST",
    headers: { Origin: requestOrigin, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const pair = async () => {
    const response = await post("/pair", { code: companion.code })
    expect(response.status).toBe(200)
    return await response.json() as { token: string; expiresAt: string }
  }
  return { companion, address, post, pair, service, calls }
}

describe("workspace companion protocol", () => {
  test("protects discovery with pairing, exact origin and strict project-only input", async () => {
    const f = fixture()
    expect((await f.post("/worktrees", { projectId: "project" })).status).toBe(401)
    const { token } = await f.pair()
    expect((await f.post("/worktrees", { projectId: "project" }, token, otherOrigin)).status).toBe(403)
    expect((await f.post("/worktrees", { projectId: "project" }, token, origin + "/")).status).toBe(403)
    for (const body of [{}, { projectId: "project", path: "/arbitrary" }, { projectId: "project", threadId: "new-thread" }, { projectId: 42 }]) {
      expect((await f.post("/worktrees", body, token)).status).toBe(400)
    }
    expect(f.calls).toEqual([])
    f.service.worktrees = async () => { throw new Error("Unknown project") }
    const unknown = await f.post("/worktrees", { projectId: "unknown" }, token)
    expect(unknown.status).toBe(409)
    expect(await unknown.json()).toEqual({ error: "Unknown project" })
    f.service.worktrees = async () => { throw new Error("private Git stderr") }
    expect(await (await f.post("/worktrees", { projectId: "project" }, token)).json()).toEqual({ error: "Workspace operation failed" })
  })

  test("validates explicit project roots and exact origins", () => {
    expect(approvedWorkspaceOrigin(origin)).toBe(true)
    expect(approvedWorkspaceOrigin(otherOrigin)).toBe(true)
    for (const invalid of ["*", "null", "http://evil.example", "https://nova.example/", "https://nova.example/path", "https://*.example", "https://u:p@nova.example"]) {
      expect(approvedWorkspaceOrigin(invalid)).toBe(false)
    }
    expect(() => startWorkspaceCompanion({ roots: [], origins: [origin] })).toThrow()
    expect(() => startWorkspaceCompanion({ roots: ["relative"], origins: [origin] })).toThrow()
    expect(() => parseWorkspaceArgs(["--project", process.cwd(), "--origin", origin, "--port", "47832"])).not.toThrow()
    for (const args of [[], ["--project", "relative", "--origin", origin], ["--project", process.cwd(), "--origin", "*"], ["--project", process.cwd(), "--origin", origin, "--port", "0"], ["--root", process.cwd()]]) {
      expect(() => parseWorkspaceArgs(args)).toThrow()
    }
  })

  test("pairs once with an expiring origin-bound token, never exposing it in errors", async () => {
    const f = fixture()
    expect(f.companion.code.length).toBeGreaterThanOrEqual(12)
    expect(f.companion.server.hostname).toBe("127.0.0.1")
    expect((await f.post("/projects", {})).status).toBe(401)
    expect((await f.post("/pair", { code: "wrong" })).status).toBe(401)
    const session = await f.pair()
    expect(Buffer.from(session.token, "base64url").byteLength).toBe(32)
    expect(Date.parse(session.expiresAt) - Date.now()).toBeGreaterThan(0)
    expect(Date.parse(session.expiresAt) - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000)
    expect((await f.post("/pair", { code: f.companion.code })).status).toBe(401)
    expect((await f.post("/projects", {}, session.token, otherOrigin)).status).toBe(403)
    const response = await f.post("/projects", {}, session.token)
    expect(await response.json()).toEqual({ projects: [{ id: "project", path: "/explicit-root" }] })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("access-control-allow-origin")).toBe(origin)
    f.service.status = async () => { throw new Error(`credential ${session.token} process stderr`) }
    const failed = await f.post("/status", { workspaceId: "workspace" }, session.token)
    expect(failed.status).toBe(409)
    expect(await failed.json()).toEqual({ error: "Workspace operation failed" })
    f.service.status = async () => { throw new Error("Preview is stale; review a new preview") }
    const stale = await f.post("/status", { workspaceId: "workspace" }, session.token)
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: "Preview is stale; review a new preview" })
  })

  test("rejects expired sessions", async () => {
    const f = fixture()
    const session = await f.pair()
    const originalNow = Date.now
    Date.now = () => Date.parse(session.expiresAt) + 1
    try {
      expect((await f.post("/projects", {}, session.token)).status).toBe(401)
    } finally {
      Date.now = originalNow
    }
  })

  test("clones only explicitly confirmed owner/name through the injected service", async () => {
    const f = fixture()
    expect((await f.post("/clone", { repositoryFullName: "owner/repo", confirmed: true })).status).toBe(401)
    const { token } = await f.pair()
    for (const body of [
      { repositoryFullName: "owner/repo" },
      { repositoryFullName: "owner/repo", confirmed: false },
      { repositoryFullName: "owner/repo", confirmed: true, path: "/browser-root" },
      ...["../repo", "owner/..", "./repo", "owner/.", "https://github.com/owner/repo", "owner/repo/extra", "owner/repo;command", "owner\\repo"].map(repositoryFullName => ({ repositoryFullName, confirmed: true })),
    ]) {
      expect((await f.post("/clone", body, token)).status).toBe(400)
    }
    expect(f.calls).toEqual([])
    const response = await f.post("/clone", { repositoryFullName: "owner/repo", confirmed: true }, token)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ project: { id: "cloned-project" } })
    expect(f.calls).toEqual([{ method: "cloneRepository", args: ["owner/repo"] }])
  })

  test("limits pair attempts including before the correct code", async () => {
    const f = fixture()
    for (let index = 0; index < 5; index++) expect((await f.post("/pair", { code: "wrong" })).status).toBe(401)
    const response = await f.post("/pair", { code: f.companion.code })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: "Pairing temporarily unavailable" })
  })

  test("rejects missing/foreign Origin and rebinding Host before pairing", async () => {
    const f = fixture()
    const requests: Record<string, string>[] = [{}, { Origin: "https://evil.example" }, { Origin: origin, Host: "evil.example" }, { Origin: origin, Host: `localhost:${f.companion.server.port}` }]
    for (const headers of requests) {
      const response = await fetch(f.address + "/pair", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ code: f.companion.code }) })
      expect(response.status).toBe(403)
    }
    expect(f.calls).toEqual([])
    expect((await fetch(f.address + "/projects", { headers: { Origin: origin } })).status).toBe(400)
  })

  test("approves CORS and private-network preflight only for exact origin and POST", async () => {
    const f = fixture()
    const headers = { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization, content-type", "Access-Control-Request-Private-Network": "true" }
    const approved = await fetch(f.address + "/projects", { method: "OPTIONS", headers })
    expect(approved.status).toBe(204)
    expect(approved.headers.get("access-control-allow-origin")).toBe(origin)
    expect(approved.headers.get("access-control-allow-private-network")).toBe("true")
    const overrides: Record<string, string>[] = [{ Origin: "https://evil.example" }, { "Access-Control-Request-Method": "GET" }, { "Access-Control-Request-Headers": "x-unsafe" }, { Host: "evil.example" }]
    for (const override of overrides) {
      const response = await fetch(f.address + "/projects", { method: "OPTIONS", headers: { ...headers, ...override } })
      expect(response.status).toBe(403)
      expect(response.headers.get("access-control-allow-private-network")).toBeNull()
    }
  })

  test("forwards each strict DTO to the injectable service", async () => {
    const f = fixture()
    const { token } = await f.pair()
    const preview = { workspaceId: "workspace", action: "commit", branch: "topic", baseBranch: "main", remote: "origin", message: "Change", files: ["src/index.ts"] }
    const create = { projectId: "project", threadId: "thread", sourceRef: "main", mode: "worktree", newBranch: "topic", copyIgnored: true }
    const cases: [string, unknown, string, unknown[], unknown][] = [
      ["lookup", { threadId: "thread" }, "lookup", ["thread"], { workspace: { id: "workspace" } }],
      ["branches", { projectId: "project" }, "branches", ["project"], { branches: ["main"] }],
      ["worktrees", { projectId: "project" }, "worktrees", ["project"], { worktrees: [{ path: "/explicit-root", branch: "main", head: "a".repeat(40), main: true, locked: false, prunable: false }] }],
      ["branches", { projectId: "project", fetch: false }, "branches", ["project"], { branches: ["main"] }],
      ["branches", { projectId: "project", fetch: true }, "fetchBranches", ["project"], { branches: ["main", "origin/topic"] }],
      ["ignored-files", { projectId: "project" }, "ignoredFiles", ["project"], { paths: [".env.local"] }],
      ["create", create, "create", [create], { workspace: { id: "workspace" } }],
      ["get", { workspaceId: "workspace" }, "get", ["workspace"], { workspace: { id: "workspace" } }],
      ["files", { workspaceId: "workspace" }, "files", ["workspace"], { paths: ["src/index.ts"] }],
      ["read", { workspaceId: "workspace", path: "src/index.ts" }, "read", ["workspace", "src/index.ts"], { content: "hello" }],
      ["write", { workspaceId: "workspace", path: "src/index.ts", content: "new" }, "write", ["workspace", "src/index.ts", "new"], { ok: true }],
      ["status", { workspaceId: "workspace" }, "status", ["workspace"], { status: { clean: true } }],
      ["preview", preview, "preview", [preview], { preview: { id: "preview" } }],
      ["publish", { previewId: "preview" }, "publish", [{ previewId: "preview" }], { result: { ok: true } }],
      ["initialize", { projectId: "project", confirmed: true }, "initialize", ["project"], { project: { id: "project" } }],
    ]
    for (const [path, body, method, args, expected] of cases) {
      const response = await f.post(`/${path}`, body, token)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expected)
      expect(f.calls.at(-1)).toEqual({ method, args })
      expect((await f.post(`/${path}`, { ...body as object, unknownField: true }, token)).status).toBe(400)
    }
    expect((await f.post("/projects", { path: "/browser-root" }, token)).status).toBe(400)
    expect((await f.post("/branches", { projectId: "project", fetch: "true" }, token)).status).toBe(400)
    expect((await f.post("/initialize", { projectId: "project" }, token)).status).toBe(400)
    expect((await f.post("/initialize", { projectId: "project", confirmed: false }, token)).status).toBe(400)
    expect((await f.post("/exec", { command: "pwd" }, token)).status).toBe(400)
    expect((await f.post("/create", { ...create, mode: "current", sourceRef: "" }, token)).status).toBe(200)
    expect((await f.post("/preview", { ...preview, action: "push", message: "", baseBranch: "", files: [] }, token)).status).toBe(200)
    f.service.lookup = async () => null
    expect(await (await f.post("/lookup", { threadId: "missing" }, token)).json()).toEqual({ workspace: null })
  })

  test("rejects malformed JSON, non-JSON, and oversized bodies without invoking service", async () => {
    const f = fixture()
    const { token } = await f.pair()
    for (const [contentType, body] of [["application/json", "{"], ["text/plain", "{}"], ["application/json", JSON.stringify({ content: "x".repeat(2 * 1024 * 1024) })]]) {
      const response = await fetch(f.address + "/projects", { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}`, "Content-Type": contentType! }, body })
      expect(response.status).toBe(400)
    }
    const streamed = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1))
      controller.close()
    } })
    const response = await f.companion.server.fetch(new Request(f.address + "/projects", {
      method: "POST",
      headers: { Origin: origin, Host: `127.0.0.1:${f.companion.server.port}`, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: streamed,
    }))
    expect(response.status).toBe(400)
    expect(f.calls).toEqual([])
  })
})
