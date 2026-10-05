import { createHash } from "node:crypto"

import { describe, expect, mock, test } from "bun:test"

import { parsePublicPrUrl } from "./public-pr-url"
import { PublicReviewError } from "./public-review-errors"
import { createPublicReviewPublishHandler } from "./public-review-publish"
import { publicReviewCommentBody } from "./public-review-publish-github"
import { readPublicReviewPublishBody } from "./public-review-publish-request"
import type { CachedPublicReview } from "./public-review-store"

const URL = "https://github.com/acme/api/pull/42"
const HEAD = "a".repeat(40)
const BASE = "b".repeat(40)
const MARKDOWN = "## Findings\n\nFull generated review."
const HASH = createHash("sha256").update(MARKDOWN).digest("hex")
const identity = parsePublicPrUrl(URL)
const input = { url: URL, headSha: HEAD, reviewHash: HASH }
const githubUser = { id: 7, type: "User" }
const repository = { id: 12, full_name: "acme/api", private: false }
const prData = {
  number: 42,
  title: "Fix authorization",
  body: "Description",
  state: "open",
  merged_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  additions: 1,
  deletions: 1,
  changed_files: 1,
  user: { login: "author", id: 7 },
  base: { sha: BASE, ref: "main", repo: repository },
  head: { sha: HEAD, ref: "fix-auth" },
}
const fileData = {
  sha: "c".repeat(40),
  filename: "src/auth.ts",
  status: "modified",
  additions: 1,
  deletions: 1,
  changes: 2,
  patch: "@@ -1 +1 @@\n-allow()\n+authorize()",
}

function request(body: unknown = input, headers: Record<string, string> = {}): Request {
  return new Request("https://supercode.test/api/public-reviews/publish", {
    method: "POST",
    headers: { Origin: "https://supercode.test", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function ownedBody(overrides: Partial<Parameters<typeof publicReviewCommentBody>[0]> = {}): string {
  return publicReviewCommentBody({ identity, headSha: HEAD, reviewHash: HASH, markdown: MARKDOWN, userId: 7, ...overrides })
}

function harness() {
  const repo = structuredClone(repository)
  const pr = structuredClone(prData)
  const files = [structuredClone(fileData)]
  const state = {
    user: githubUser,
    comments: [] as Array<{ id: number; body: string; user: { id: number; type: string }; performed_via_github_app?: unknown }>,
    next: false,
    status: 200,
    writeProvenance: undefined as unknown,
    writes: [] as Array<{ path: string; method: string; body: string }>,
    onComments: undefined as (() => void) | undefined,
    override: undefined as ((path: string, init?: RequestInit) => Response | undefined) | undefined,
  }
  const fetcher = mock(async (source: RequestInfo | URL, init?: RequestInit) => {
    const path = String(source).replace("https://api.github.com", "")
    const overridden = state.override?.(path, init)
    if (overridden) return overridden
    if (init?.method === "POST" || init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)).body as string
      state.writes.push({ path, method: init.method, body })
      if (state.status !== 200) return Response.json({ message: "secret-provider-body" }, { status: state.status })
      return Response.json({ id: init.method === "PATCH" ? Number(path.split("/").at(-1)) : 321, body, user: state.user, ...(state.writeProvenance != null && { performed_via_github_app: state.writeProvenance }) })
    }
    if (path === "/user") return Response.json(state.user)
    if (path.includes("/comments?")) {
      state.onComments?.()
      return Response.json(state.comments, { headers: state.next ? { Link: '<https://api.github.com/ignored>; rel="next"' } : {} })
    }
    if (path.includes("/files?")) return Response.json(files)
    if (path.includes("/pulls/42")) return Response.json(pr)
    return Response.json(repo)
  })
  const getSession = mock(async (): Promise<{ user: { id: string } } | null> => ({ user: { id: "session-user" } }))
  const getToken = mock(async () => "only-current-user-token")
  const cache = {
    read: mock<(key: string, hash: string) => Promise<CachedPublicReview | null>>(async () => ({ markdown: `  ${MARKDOWN}\n`, updatedAt: new Date() })),
    reserveFetch: mock(async () => { throw new Error("Anonymous fetch quota must never run") }),
    reserveGeneration: mock(async () => { throw new Error("Generation must never run") }),
    complete: mock(async () => { throw new Error("Generation storage must never run") }),
  }
  const store = {
    begin: mock(async () => ({ key: "user-pr-lock", token: "lease-token" })),
    reserveWrite: mock(async () => {}),
    assertLease: mock(async () => {}),
    release: mock(async () => {}),
  }
  const handler = createPublicReviewPublishHandler({ getSession, getToken, cache, store, fetcher: fetcher as unknown as typeof fetch })
  return { handler, getSession, getToken, cache, store, fetcher, state, repo, pr, files }
}

describe("authenticated public review publishing", () => {
  test("authentication fails before token, network, cache, or quota access", async () => {
    const h = harness()
    h.getSession.mockResolvedValue(null)
    const response = await h.handler(request())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: expect.any(String), code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" })
    expect(h.getToken).not.toHaveBeenCalled()
    expect(h.fetcher).not.toHaveBeenCalled()
    expect(h.cache.read).not.toHaveBeenCalled()
    expect(h.store.begin).not.toHaveBeenCalled()
  })

  test.each([
    { Origin: "https://evil.test" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
    { Origin: "null" },
    { Origin: "" },
  ] as Array<Record<string, string>>)("same-origin enforcement precedes connected-token and storage access: %j", async (headers) => {
    const h = harness()
    expect((await h.handler(request(input, headers))).status).toBe(403)
    expect(h.getSession).toHaveBeenCalled()
    expect(h.getToken).not.toHaveBeenCalled()
    expect(h.store.begin).not.toHaveBeenCalled()
    expect(h.fetcher).not.toHaveBeenCalled()
  })

  test("development localhost curl works without Origin", async () => {
    const h = harness()
    const req = new Request("http://localhost:3003/api/public-reviews/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
    expect((await h.handler(req)).status).toBe(200)
  })

  test.each([
    { ...input, markdown: "untrusted" },
    { ...input, token: "untrusted" },
    { ...input, userId: "other-user" },
    { ...input, headSha: "short" },
    { ...input, reviewHash: "z".repeat(64) },
    { url: URL, headSha: HEAD },
    { ...input, url: "https://github.com/acme/api" },
    { ...input, url: "https://attacker.test/acme/api/pull/42" },
    null,
    [],
  ])("invalid input cannot reach token, cache, or GitHub: %j", async (body) => {
    const h = harness()
    expect((await h.handler(request(body))).status).toBe(400)
    expect(h.getToken).not.toHaveBeenCalled()
    expect(h.cache.read).not.toHaveBeenCalled()
    expect(h.store.begin).not.toHaveBeenCalled()
    expect(h.fetcher).not.toHaveBeenCalled()
  })

  test.each(["", "reauth"])("missing or expired OAuth fails before source fetch: %s", async (value) => {
    const h = harness()
    if (value) h.getToken.mockRejectedValue(Object.assign(new Error("secret-account-details"), { code: "GITHUB_REAUTH_REQUIRED" }))
    else h.getToken.mockResolvedValue("")
    const response = await h.handler(request())
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" })
    expect(h.getToken).toHaveBeenCalledWith("session-user")
    expect(h.fetcher).not.toHaveBeenCalled()
    expect(h.cache.read).not.toHaveBeenCalled()
    expect(h.store.begin).not.toHaveBeenCalled()
  })

  test("successful publish uses only the session user's token for both snapshots and comments", async () => {
    const h = harness()
    const response = await h.handler(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ commentUrl: `${URL}#issuecomment-321` })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(h.getToken).toHaveBeenCalledWith("session-user")
    expect(h.store.begin).toHaveBeenCalledWith("session-user", URL)
    expect(h.cache.read).toHaveBeenCalledWith(`acme/api#42@${HEAD}`, expect.stringMatching(/^[a-f\d]{64}$/))
    expect(h.cache.reserveFetch).not.toHaveBeenCalled()
    expect(h.cache.reserveGeneration).not.toHaveBeenCalled()
    expect(h.cache.complete).not.toHaveBeenCalled()
    expect(h.state.writes).toEqual([{ path: "/repos/acme/api/issues/42/comments", method: "POST", body: ownedBody() }])
    for (const [source, init] of h.fetcher.mock.calls) {
      expect(String(source)).toStartWith("https://api.github.com/")
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer only-current-user-token")
      expect(init?.redirect).toBe("error")
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(h.store.reserveWrite).toHaveBeenCalledTimes(1)
    expect(h.store.assertLease).toHaveBeenCalledTimes(1)
    expect(h.store.release).toHaveBeenCalledTimes(1)
    expect(h.fetcher.mock.calls.filter(([source]) => String(source).endsWith("/repos/acme/api"))).toHaveLength(2)
    expect(h.state.writes[0].body).toContain("[Supercode](https://supercli.com)")
    expect(h.state.writes[0].body).not.toContain("supercode.sh")
  })

  test.each(["repository", "pr"])("private %s is rejected before cache and comment APIs", async (target) => {
    const h = harness()
    if (target === "repository") h.repo.private = true
    else h.pr.base.repo.private = true
    expect((await h.handler(request())).status).toBe(403)
    expect(h.cache.read).not.toHaveBeenCalled()
    expect(h.state.writes).toHaveLength(0)
    expect(h.store.release).toHaveBeenCalled()
    expect(h.fetcher).toHaveBeenCalledTimes(target === "repository" ? 1 : 2)
    expect(h.fetcher.mock.calls.some(([source]) => String(source).includes("/files?") || String(source).includes("/git/trees/"))).toBe(false)
    for (const [, init] of h.fetcher.mock.calls) expect(new Headers(init?.headers).get("authorization")).toBe("Bearer only-current-user-token")
    if (target === "repository") expect(h.fetcher.mock.calls.some(([source]) => String(source).includes("/pulls/"))).toBe(false)
  })

  test.each(["repository", "pr", "files", "final-repository", "final-pr"])("revoked OAuth at %s returns the connection-required contract without posting", async (target) => {
    const h = harness()
    let final = false
    h.state.onComments = () => { final = true }
    h.state.override = (path) => {
      const revoked = (target === "repository" && path === "/repos/acme/api")
        || (target === "pr" && path === "/repos/acme/api/pulls/42")
        || (target === "files" && path.includes("/files?"))
        || (target === "final-repository" && final && path === "/repos/acme/api")
        || (target === "final-pr" && final && path === "/repos/acme/api/pulls/42")
      return revoked ? Response.json({ message: "secret-revoked-token-details" }, { status: 401 }) : undefined
    }
    const response = await h.handler(request())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: expect.any(String), code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" })
    expect(h.state.writes).toHaveLength(0)
    expect(h.store.release).toHaveBeenCalled()
    if (!target.startsWith("final-")) expect(h.cache.read).not.toHaveBeenCalled()
  })

  test("a noncurrent displayed head is rejected before cache access", async () => {
    const h = harness()
    h.pr.head.sha = "d".repeat(40)
    expect((await h.handler(request())).status).toBe(409)
    expect(h.cache.read).not.toHaveBeenCalled()
    expect(h.state.writes).toHaveLength(0)
  })

  test.each(["missing", "empty", "different"])("cached review %s is rejected without generating", async (kind) => {
    const h = harness()
    h.cache.read.mockResolvedValue(kind === "missing" ? null : { markdown: kind === "empty" ? "  \n" : "Different review", updatedAt: new Date() })
    expect((await h.handler(request())).status).toBe(409)
    expect(h.state.writes).toHaveLength(0)
    expect(h.cache.reserveGeneration).not.toHaveBeenCalled()
    expect(h.fetcher.mock.calls.some(([url]) => String(url).endsWith("/user"))).toBe(false)
  })

  test("cache matching covers current base, title, description, and diff", async () => {
    const h = harness()
    await h.handler(request())
    const oldHash = h.cache.read.mock.calls[0][1]
    h.pr.body = "Changed description"
    h.pr.title = "Changed title"
    h.pr.base.sha = "d".repeat(40)
    h.files[0].patch = "@@ -1 +1 @@\n-old()\n+new()"
    h.cache.read.mockImplementation(async (_key, hash) => hash === oldHash ? { markdown: MARKDOWN, updatedAt: new Date() } : null)
    expect((await h.handler(request())).status).toBe(409)
    expect(h.cache.read.mock.calls[1][1]).not.toBe(oldHash)
    expect(h.state.writes).toHaveLength(1)
  })

  test.each(["head", "base", "title", "body", "diff", "private"])("a final %s change prevents the write", async (kind) => {
    const h = harness()
    h.state.onComments = () => {
      if (kind === "head") h.pr.head.sha = "d".repeat(40)
      if (kind === "base") h.pr.base.sha = "d".repeat(40)
      if (kind === "title") h.pr.title += " changed"
      if (kind === "body") h.pr.body += " changed"
      if (kind === "diff") h.files[0].patch = "@@ -1 +1 @@\n-old()\n+new()"
      if (kind === "private") h.repo.private = true
    }
    expect((await h.handler(request())).status).toBe(kind === "private" ? 403 : 409)
    expect(h.state.writes).toHaveLength(0)
    expect(h.store.release).toHaveBeenCalled()
  })

  test.each(["quota", "storage"])("%s failures stop before GitHub access", async (kind) => {
    const h = harness()
    h.store.begin.mockRejectedValue(kind === "quota" ? new PublicReviewError("Rate limited", 429, 30) : new Error("secret-storage-failure"))
    const response = await h.handler(request())
    expect(response.status).toBe(kind === "quota" ? 429 : 503)
    expect(JSON.stringify(await response.json())).not.toContain("secret")
    expect(h.fetcher).not.toHaveBeenCalled()
    expect(h.cache.read).not.toHaveBeenCalled()
  })

  test.each(["cache", "write-quota", "lease"])("%s failure prevents writing and releases the lock", async (kind) => {
    const h = harness()
    if (kind === "cache") h.cache.read.mockRejectedValue(new Error("secret-storage-failure"))
    if (kind === "write-quota") h.store.reserveWrite.mockRejectedValue(new PublicReviewError("Rate limited", 429))
    if (kind === "lease") h.store.assertLease.mockRejectedValue(new PublicReviewError("Expired lease", 409))
    expect((await h.handler(request())).status).toBe(kind === "cache" ? 503 : kind === "write-quota" ? 429 : 409)
    expect(h.state.writes).toHaveLength(0)
    expect(h.store.release).toHaveBeenCalled()
  })

  test.each([401, 403, 404, 429, 500])("GitHub write failure %i is sanitized and never retried", async (status) => {
    const h = harness()
    h.state.status = status
    const response = await h.handler(request())
    expect(response.status).toBe(status === 404 ? 403 : status === 500 ? 502 : status)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain("secret-provider-body")
    if (status === 401) expect(body).toMatchObject({ code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" })
    expect(h.state.writes).toHaveLength(1)
    expect(h.store.release).toHaveBeenCalled()
  })

  test("secondary GitHub throttling is 429 rather than a permission error", async () => {
    const h = harness()
    h.state.override = (path) => path === "/user" ? Response.json({}, { status: 403, headers: { "Retry-After": "60" } }) : undefined
    const response = await h.handler(request())
    expect(response.status).toBe(429)
    expect(h.state.writes).toHaveLength(0)
  })

  test("only the authenticated user's distinct marker comment can be updated", async () => {
    const h = harness()
    h.state.comments = [
      { id: 1, user: { id: 99, type: "User" }, body: ownedBody({ userId: 99 }) },
      { id: 2, user: githubUser, body: "<!-- supercode-review -->\nAutomated review" },
      { id: 3, user: { id: 99, type: "Bot" }, performed_via_github_app: { id: 1 }, body: ownedBody() },
      { id: 4, user: { id: 7, type: "Bot" }, body: ownedBody() },
      { id: 5, user: githubUser, body: ownedBody({ userId: 99 }) },
      { id: 6, user: githubUser, body: ownedBody({ markdown: "Previous generated review", reviewHash: "d".repeat(64) }) },
    ]
    expect((await h.handler(request())).status).toBe(200)
    expect(h.state.writes).toEqual([{ path: "/repos/acme/api/issues/comments/6", method: "PATCH", body: ownedBody() }])
  })

  test("foreign and automatic markers do not prevent creating a user-owned comment", async () => {
    const h = harness()
    h.state.comments = [
      { id: 1, user: { id: 99, type: "User" }, body: ownedBody() },
      { id: 2, user: githubUser, body: "<!-- supercode-review -->\nAutomated review" },
      { id: 3, user: githubUser, performed_via_github_app: { id: 1 }, body: "<!-- supercode-review -->\nAutomated review" },
      { id: 4, user: { id: 99, type: "Bot" }, performed_via_github_app: { id: 1 }, body: ownedBody() },
    ]
    expect((await h.handler(request())).status).toBe(200)
    expect(h.state.writes[0].method).toBe("POST")
  })

  test("same complete review returns the existing URL without a write charge", async () => {
    const h = harness()
    h.state.comments = [{ id: 123, user: githubUser, body: ownedBody() }]
    const response = await h.handler(request())
    expect(await response.json()).toEqual({ commentUrl: `${URL}#issuecomment-123`, alreadyPosted: true })
    expect(h.store.reserveWrite).not.toHaveBeenCalled()
    expect(h.store.assertLease).toHaveBeenCalled()
    expect(h.state.writes).toHaveLength(0)
  })

  test("a GitHub App user-token comment is confirmed and reused idempotently", async () => {
    const h = harness()
    const app = { id: 123, slug: "supercode" }
    h.state.writeProvenance = app
    const created = await h.handler(request())
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({ commentUrl: `${URL}#issuecomment-321` })
    expect(h.state.writes).toHaveLength(1)
    h.state.comments = [{ id: 321, user: githubUser, performed_via_github_app: app, body: h.state.writes[0].body }]
    const reused = await h.handler(request())
    expect(reused.status).toBe(200)
    expect(await reused.json()).toEqual({ commentUrl: `${URL}#issuecomment-321`, alreadyPosted: true })
    expect(h.state.writes).toHaveLength(1)
    expect(h.store.reserveWrite).toHaveBeenCalledTimes(1)
  })

  test("a human-owned manual comment with App provenance can be updated", async () => {
    const h = harness()
    const app = { id: 123, slug: "supercode" }
    h.state.writeProvenance = app
    h.state.comments = [{ id: 123, user: githubUser, performed_via_github_app: app, body: ownedBody({ markdown: "Previous review", reviewHash: "d".repeat(64) }) }]
    const updated = await h.handler(request())
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ commentUrl: `${URL}#issuecomment-123` })
    expect(h.state.writes).toEqual([{ path: "/repos/acme/api/issues/comments/123", method: "PATCH", body: ownedBody() }])
  })

  test("search continues to a later owned comment and does not follow Link URLs", async () => {
    const h = harness()
    h.state.override = (path) => {
      if (!path.includes("/comments?")) return undefined
      if (path.endsWith("page=1")) return Response.json([], { headers: { Link: '<https://attacker.test/never-fetch>; rel="next"' } })
      return Response.json([{ id: 789, user: githubUser, body: ownedBody() }])
    }
    expect(await (await h.handler(request())).json()).toEqual({ commentUrl: `${URL}#issuecomment-789`, alreadyPosted: true })
    expect(h.state.writes).toHaveLength(0)
    expect(h.fetcher.mock.calls.every(([url]) => String(url).startsWith("https://api.github.com/"))).toBe(true)
  })

  test("incomplete five-page search refuses even if an owned comment was found", async () => {
    const h = harness()
    h.state.next = true
    h.state.comments = [{ id: 1, user: githubUser, body: ownedBody() }]
    expect((await h.handler(request())).status).toBe(422)
    expect(h.fetcher.mock.calls.filter(([url]) => String(url).includes("/comments?")).length).toBe(5)
    expect(h.state.writes).toHaveLength(0)
  })

  test("full UTF-8 review size is checked without silent truncation", async () => {
    const h = harness()
    const markdown = "界".repeat(22_000)
    h.cache.read.mockResolvedValue({ markdown, updatedAt: new Date() })
    const response = await h.handler(request({ ...input, reviewHash: createHash("sha256").update(markdown).digest("hex") }))
    expect(response.status).toBe(422)
    expect(h.state.writes).toHaveLength(0)
    expect(() => ownedBody({ markdown })).toThrow()
  })

  test("oversized GitHub comment output is bounded before a write", async () => {
    const h = harness()
    h.state.override = (path) => path.includes("/comments?") ? new Response("x".repeat(1_000_001)) : undefined
    expect((await h.handler(request())).status).toBe(422)
    expect(h.state.writes).toHaveLength(0)
  })

  test("malformed GitHub comment data fails closed", async () => {
    const h = harness()
    h.state.override = (path) => path.includes("/comments?") ? Response.json([{ id: 1, body: "incomplete" }]) : undefined
    expect((await h.handler(request())).status).toBe(502)
    expect(h.state.writes).toHaveLength(0)
  })

  test("an unconfirmed write response never returns a success URL or retries", async () => {
    const h = harness()
    h.state.override = (_path, init) => init?.method === "POST" ? Response.json({ id: 321, user: githubUser, body: "Unexpected body" }) : undefined
    expect((await h.handler(request())).status).toBe(502)
    expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
  })

  test("GitHub connection rejection during account verification is safe JSON", async () => {
    const h = harness()
    h.state.override = (path) => path === "/user" ? Response.json({ message: "secret-account-details" }, { status: 401 }) : undefined
    const response = await h.handler(request())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: expect.any(String), code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" })
    expect(h.state.writes).toHaveLength(0)
  })

  test("a timed-out write is attempted exactly once and returns no comment URL", async () => {
    const h = harness()
    h.fetcher.mockImplementation(async (_source, init) => {
      if (init?.method === "POST") throw new Error("secret-network-failure")
      if (String(_source).endsWith("/user")) return Response.json(githubUser)
      if (String(_source).includes("/comments?")) return Response.json([])
      if (String(_source).includes("/files?")) return Response.json(h.files)
      if (String(_source).includes("/pulls/")) return Response.json(h.pr)
      return Response.json(h.repo)
    })
    const response = await h.handler(request())
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: expect.any(String) })
    expect(h.fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1)
    expect(h.store.release).toHaveBeenCalled()
  })

  test("request cancellation prevents the final write", async () => {
    const h = harness()
    const controller = new AbortController()
    h.state.onComments = () => controller.abort()
    const req = new Request(request(), { signal: controller.signal })
    expect((await h.handler(req)).status).toBe(504)
    expect(h.state.writes).toHaveLength(0)
    expect(h.store.release).toHaveBeenCalled()
  })
})

describe("publish JSON bounds", () => {
  test("content type and encoded bodies are rejected", async () => {
    await expect(readPublicReviewPublishBody(request(input, { "Content-Type": "text/plain" }))).rejects.toMatchObject({ status: 415 })
    await expect(readPublicReviewPublishBody(request(input, { "Content-Encoding": "gzip" }))).rejects.toMatchObject({ status: 415 })
  })

  test("declared and streamed oversized bodies are rejected", async () => {
    await expect(readPublicReviewPublishBody(request(input, { "Content-Length": "4097" }))).rejects.toMatchObject({ status: 413 })
    await expect(readPublicReviewPublishBody(request({ ...input, url: "x".repeat(4097) }))).rejects.toMatchObject({ status: 413 })
  })

  test("malformed JSON and missing body are rejected", async () => {
    const req = new Request(request(), { body: "{" })
    await expect(readPublicReviewPublishBody(req)).rejects.toMatchObject({ status: 400 })
    await expect(readPublicReviewPublishBody(new Request("https://supercode.test", { method: "POST", headers: { "Content-Type": "application/json" } }))).rejects.toMatchObject({ status: 400 })
  })

  test("stalled bodies are cancelled at the deadline", async () => {
    const cancel = mock(() => {})
    const req = new Request("https://supercode.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: new ReadableStream({ cancel }) })
    await expect(readPublicReviewPublishBody(req, 5)).rejects.toMatchObject({ status: 408 })
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
