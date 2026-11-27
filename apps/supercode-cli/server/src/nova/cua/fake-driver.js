#!/usr/bin/env bun
import { createInterface } from "node:readline"

const tools = [
  { name: "list_apps", inputSchema: { type: "object", properties: {} } },
  { name: "list_windows", inputSchema: { type: "object", properties: {} } },
  { name: "get_window_state", inputSchema: { type: "object", properties: { pid: { type: "integer" }, window_id: { type: "integer" }, include_screenshot: { type: "boolean" }, tree_format: { type: "string", enum: ["markdown", "elements", "both"] } }, required: ["pid", "window_id"] } },
]
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line)
  if (message.method === "initialize") send(message.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } })
  if (message.method === "tools/list") send(message.id, { tools })
  if (message.method !== "tools/call") return
  const { name, arguments: args } = message.params
  if (args.pid === 99) return
  if (args.pid === 88) return void process.stdout.write("x".repeat(600_000))
  if (name === "get_window_state" && (args.include_screenshot !== false || args.tree_format !== "elements")) process.exit(1)
  const key = name === "list_apps" ? "apps" : name === "list_windows" ? "windows" : "elements"
  send(message.id, { content: [{ type: "text", text: "secret" }, { type: "image", mimeType: "image/png", data: "c2VjcmV0" }], structuredContent: { [key]: Array.from({ length: 120 }, () => ({ pid: 123, window_id: 456, title: "secret", value: "secret" })) } })
})
