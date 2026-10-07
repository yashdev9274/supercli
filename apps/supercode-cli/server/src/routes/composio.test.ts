import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import type { Composio } from "@composio/core"
import express from "express"
import type { Server } from "node:http"

import { ServerComposioService } from "../lib/composio"
import { registerComposioRoutes } from "./composio"

const originalSecret = process.env.BETTER_AUTH_SECRET
const originalUrl = process.env.BETTER_AUTH_URL
const originalNovaUrl = process.env.NOVA_WEB_URL

describe("CLI Composio connections", () => {
  let server: Server
  let baseUrl: string
  let accounts: Array<{ id: string; owner: string; status: string; toolkit: { slug: string }; isDisabled: boolean }>
  let callbackUrl: string
  let service: ServerComposioService
  let client: ReturnType<typeof createClient>

  function createClient() {
    return {
      connectedAccounts: {
        list: mock(async (query: { userIds: string[]; cursor?: string; statuses: string[] }) => ({
          items: accounts.filter((account) => query.userIds.includes(account.owner) && query.statuses.includes(account.status)),
          nextCursor: null as string | null,
        })),
        link: mock(async (userId: string, _configId: string, options: { callbackUrl: string }) => {
          callbackUrl = options.callbackUrl
          accounts.push({ id: "ca_new", owner: userId, status: "INITIATED", toolkit: { slug: "linear" }, isDisabled: false })
          return { id: "ca_new", redirectUrl: "https://connect.composio.dev/authorize" }
        }),
        delete: mock(async (id: string) => { accounts = accounts.filter((account) => account.id !== id) }),
      },
      authConfigs: {
        list: mock(async (query: { toolkit?: string; cursor?: string }) => ({
          items: ["github", "googlecalendar", "linear"].filter((slug) => !query.toolkit || query.toolkit === slug)
            .map((slug) => ({ id: `ac_${slug}`, toolkit: { slug }, status: "ENABLED" })),
          nextCursor: null as string | null,
        })),
        create: mock(async () => ({ id: "ac_managed" })),
      },
      toolkits: {
        get: mock(async () => ["github", "googlecalendar", "linear"].map((slug) => ({ slug, name: slug, meta: {} }))),
      },
      sessions: {
        create: mock(async (_userId: string, _options: unknown) => ({ sessionId: "session_1", mcp: { url: "https://mcp.composio.dev/session_1", headers: { "x-mcp-secret": "test-only" } } })),
      },
      tools: {
        getRawComposioTools: mock(async () => [
          { slug: "GOOGLECALENDAR_LIST_EVENTS", name: "List events", toolkit: { slug: "googlecalendar", name: "Calendar" } },
          { slug: "GOOGLECALENDAR_CREATE_EVENT", name: "Create event", toolkit: { slug: "googlecalendar", name: "Calendar" } },
          { slug: "GITHUB_CREATE_ISSUE", name: "Create issue", toolkit: { slug: "github", name: "GitHub" } },
        ]),
        execute: mock(async (_name: string, _options: unknown) => ({ successful: true, data: {} })),
      },
    }
  }

  async function post(action: string, body: unknown = {}, token = "user_1") {
    return fetch(`${baseUrl}/api/composio/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  beforeEach(async () => {
    process.env.BETTER_AUTH_SECRET = "test-cli-composio-secret"
    process.env.BETTER_AUTH_URL = "http://localhost:3004"
    process.env.NOVA_WEB_URL = "http://nova.localhost:3003"
    accounts = [
      { id: "ca_calendar", owner: "user_1", status: "ACTIVE", toolkit: { slug: "googlecalendar" }, isDisabled: false },
      { id: "ca_review", owner: "org_review", status: "ACTIVE", toolkit: { slug: "github" }, isDisabled: false },
      { id: "ca_other", owner: "user_2", status: "ACTIVE", toolkit: { slug: "github" }, isDisabled: false },
    ]
    callbackUrl = ""
    client = createClient()
    service = new ServerComposioService(client as unknown as Composio)
    const app = express()
    app.use(express.json())
    registerComposioRoutes(app, async (req) => {
      const token = req.headers.authorization?.replace("Bearer ", "")
      return token === "user_1" || token === "user_2" ? { id: token } : null
    }, service)
    await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()) })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No test server address")
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    for (const [key, value] of [["BETTER_AUTH_SECRET", originalSecret], ["BETTER_AUTH_URL", originalUrl], ["NOVA_WEB_URL", originalNovaUrl]]) {
      if (!key) continue
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test("lists CLI-configured apps beyond Review providers, scoped to the authenticated user", async () => {
    const response = await post("apps")
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.apps).toHaveLength(3)
    expect(payload.apps.find((app: { slug: string }) => app.slug === "googlecalendar").connectedAccountId).toBe("ca_calendar")
    expect(payload.apps.find((app: { slug: string }) => app.slug === "github").connected).toBe(false)
    expect(client.connectedAccounts.list.mock.calls[0]?.[0].userIds).toEqual(["user_1"])
  })

  test("creates MCP sessions only from the same user’s CLI accounts", async () => {
    const response = await post("session")
    expect(response.status).toBe(200)
    expect((await response.json()).sessionId).toBe("session_1")
    expect(client.sessions.create).toHaveBeenCalledWith("user_1", {
      mcp: true, connectedAccounts: { googlecalendar: "ca_calendar" }, toolkits: ["googlecalendar"], manageConnections: false,
    })
  })

  test("web OAuth returns to Nova and the new account appears for desktop too", async () => {
    const connection = await post("connect", { slug: "linear", returnTo: "nova" })
    expect(connection.status).toBe(200)
    expect((await connection.json()).connectedAccountId).toBe("ca_new")
    expect(new URL(callbackUrl).pathname).toBe("/api/composio/callback")
    const account = accounts.find((candidate) => candidate.id === "ca_new")
    if (!account) throw new Error("Missing connected account")
    account.status = "ACTIVE"
    const callback = new URL(callbackUrl)
    callback.searchParams.set("connected_account_id", "ca_new")
    callback.searchParams.set("status", "success")
    const completion = await fetch(`${baseUrl}${callback.pathname}${callback.search}`, { redirect: "manual" })
    expect(completion.status).toBe(303)
    expect(completion.headers.get("location")).toBe("http://nova.localhost:3003/connections?connected=linear")
    const desktop = await post("apps")
    expect((await desktop.json()).apps.find((app: { slug: string }) => app.slug === "linear").connectedAccountId).toBe("ca_new")
  })

  test("desktop OAuth retains the native completion URL and denied web OAuth stays in Nova", async () => {
    await post("connect", { slug: "linear" })
    let callback = new URL(callbackUrl)
    callback.searchParams.set("error", "denied")
    const desktop = await fetch(`${baseUrl}${callback.pathname}${callback.search}`, { redirect: "manual" })
    expect(desktop.headers.get("location")).toBe("supercode://composio/connected?provider=linear&error=oauth_denied")
    await post("connect", { slug: "linear", returnTo: "nova" })
    callback = new URL(callbackUrl)
    callback.searchParams.set("status", "failed")
    const web = await fetch(`${baseUrl}${callback.pathname}${callback.search}`, { redirect: "manual" })
    expect(web.headers.get("location")).toBe("http://nova.localhost:3003/connections?integration_error=oauth_denied")
  })

  test("rejects tampered OAuth state and another user’s callback account", async () => {
    await post("connect", { slug: "linear", returnTo: "nova" })
    const callback = new URL(callbackUrl)
    const original = callback.searchParams.get("state") ?? ""
    callback.searchParams.set("state", `${original}changed`)
    expect((await fetch(`${baseUrl}${callback.pathname}${callback.search}`)).status).toBe(400)
    callback.searchParams.set("state", original)
    callback.searchParams.set("connected_account_id", "ca_other")
    const foreign = await fetch(`${baseUrl}${callback.pathname}${callback.search}`, { redirect: "manual" })
    expect(foreign.headers.get("location")).toContain("integration_error=connection_invalid")
  })

  test("disconnect cannot touch Review or another user, and revokes the shared CLI account", async () => {
    expect((await post("disconnect", { connectedAccountId: "ca_review" })).status).toBe(404)
    expect((await post("disconnect", { connectedAccountId: "ca_other" })).status).toBe(404)
    expect(client.connectedAccounts.delete).not.toHaveBeenCalled()
    expect((await post("disconnect", { connectedAccountId: "ca_calendar" })).status).toBe(200)
    expect((await service.listApps("user_1")).find((app) => app.slug === "googlecalendar")?.connected).toBe(false)
  })

  test("exposes and executes tools only for connected CLI accounts", async () => {
    const tools = await (await post("tools")).json()
    expect(tools.tools.map((tool: { name: string }) => tool.name)).toEqual(["GOOGLECALENDAR_LIST_EVENTS", "GOOGLECALENDAR_CREATE_EVENT"])
    expect(tools.tools[0].requiresApproval).toBe(false)
    expect(tools.tools[1].requiresApproval).toBe(true)
    expect((await post("execute", { name: "GITHUB_CREATE_ISSUE", arguments: {} })).status).toBe(403)
    expect((await post("execute", { name: "GOOGLECALENDAR_LIST_EVENTS", arguments: {} })).status).toBe(200)
    expect(client.tools.execute).toHaveBeenCalledWith("GOOGLECALENDAR_LIST_EVENTS", {
      userId: "user_1", connectedAccountId: "ca_calendar", arguments: {}, version: "latest",
    })
  })

  test("requires authentication and validates input", async () => {
    expect((await post("apps", {}, "invalid")).status).toBe(401)
    expect((await post("connect", { slug: "../dashboard" })).status).toBe(400)
  })

  test("paginates user-scoped accounts and auth configs", async () => {
    client.connectedAccounts.list.mockImplementation(async (query) => ({
      items: query.cursor ? [accounts[0]!] : [], nextCursor: query.cursor ? null : "page_2",
    }))
    client.authConfigs.list.mockImplementation(async (query) => ({
      items: query.cursor ? [{ id: "ac_calendar", toolkit: { slug: "googlecalendar" }, status: "ENABLED" }] : [], nextCursor: query.cursor ? null : "page_2",
    }))
    const apps = await service.listApps("user_1")
    expect(apps).toHaveLength(1)
    expect(apps[0]?.connectedAccountId).toBe("ca_calendar")
    expect(client.connectedAccounts.list.mock.calls[1]?.[0].userIds).toEqual(["user_1"])
  })
})
