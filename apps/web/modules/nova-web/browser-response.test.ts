import { expect, test } from "bun:test"

import { readBrowserResponse } from "./browser-response"

test("HTML 404 produces an actionable endpoint error rather than JSON syntax error", async () => {
  await expect(readBrowserResponse(new Response("<!DOCTYPE html><html>Not found</html>", { status: 404, headers: { "content-type": "text/html" } }))).rejects.toThrow("browser endpoint is unavailable")
})

test("JSON browser state is returned", async () => {
  await expect(readBrowserResponse(Response.json({ configured: false, browser: null }))).resolves.toEqual({ configured: false, browser: null })
})

test("structured errors are preserved", async () => {
  await expect(readBrowserResponse(Response.json({ error: "Unauthorized" }, { status: 401 }))).rejects.toThrow("Unauthorized")
})

test("invalid JSON and HTML failures are sanitized", async () => {
  await expect(readBrowserResponse(new Response("<html>secret internal details</html>", { status: 500, headers: { "content-type": "text/html" } }))).rejects.toThrow("unexpected response (500)")
  await expect(readBrowserResponse(new Response("{", { headers: { "content-type": "application/json" } }))).rejects.toThrow("invalid response")
})
