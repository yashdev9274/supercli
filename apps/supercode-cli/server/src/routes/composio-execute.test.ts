import { afterAll, expect, mock, test } from "bun:test"
import express from "express"
import type { Composio } from "@composio/core"

import { ServerComposioService } from "../lib/composio"
import { registerComposioRoutes } from "./composio"

const execute = mock(async (_name: string, _args: unknown) => ({ successful: true, data: { workspace: "Connected workspace" } }))
const client = {
  connectedAccounts: { list: async () => ({ items: [{ id: "ca_linear", status: "ACTIVE", isDisabled: false, toolkit: { slug: "linear" } }], nextCursor: null }) },
  tools: {
    getRawComposioTools: async () => [{ slug: "LINEAR_GET_WORKSPACE", toolkit: { slug: "linear" } }],
    execute,
  },
} as unknown as Composio
const app = express()
app.use(express.json())
registerComposioRoutes(app, async () => ({ id: "cli_user" }), new ServerComposioService(client))
const server = app.listen(0, "127.0.0.1")
await new Promise<void>((resolve) => server.once("listening", () => resolve()))
const address = server.address()
if (!address || typeof address === "string") throw new Error("No test server address")
const url = `http://127.0.0.1:${address.port}/api/composio/execute`
afterAll(() => { server.closeAllConnections(); server.close() })

async function post(body: unknown) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

test("accepts desktop’s toolName execute contract", async () => {
  const response = await post({ toolName: "LINEAR_GET_WORKSPACE", arguments: {} })
  expect(response.status).toBe(200)
  expect((await response.json()).successful).toBe(true)
  expect(execute).toHaveBeenCalledWith("LINEAR_GET_WORKSPACE", {
    userId: "cli_user", connectedAccountId: "ca_linear", arguments: {}, version: "latest",
  })
})

test("keeps name compatibility and rejects conflicting names", async () => {
  expect((await post({ name: "LINEAR_GET_WORKSPACE", arguments: {} })).status).toBe(200)
  expect((await post({ toolName: "LINEAR_GET_WORKSPACE", name: "OTHER_TOOL", arguments: {} })).status).toBe(400)
  expect((await post({ arguments: {} })).status).toBe(400)
})
