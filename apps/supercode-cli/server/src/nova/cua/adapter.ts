import { access, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { isAbsolute } from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js"
import { JSONRPCMessageSchema, type JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"

const MAX_MESSAGE_BYTES = 512 * 1024
const TIMEOUT_MS = 10_000
const ALLOWED = ["list_apps", "list_windows", "get_window_state"] as const
type Tool = (typeof ALLOWED)[number]

class BoundedStdio implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private child?: ChildProcessWithoutNullStreams
  private buffer = Buffer.alloc(0)
  private closed = false

  constructor(private readonly executable: string) {}

  async start() {
    if (this.child || this.closed) throw new Error("Transport unavailable")
    const child = spawn(this.executable, ["mcp"], {
      shell: false,
      env: getDefaultEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.child = child
    child.stderr.resume()
    child.on("close", () => {
      this.closed = true
      this.buffer = Buffer.alloc(0)
      this.onclose?.()
    })
    child.on("error", () => this.fail())
    child.stdin.on("error", () => this.fail())
    child.stdout.on("error", () => this.fail())
    child.stdout.on("data", (chunk: Buffer) => {
      if (this.closed) return
      let offset = 0
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset)
        const end = newline < 0 ? chunk.length : newline
        if (this.buffer.length + end - offset > MAX_MESSAGE_BYTES) return this.fail()
        this.buffer = Buffer.concat([this.buffer, chunk.subarray(offset, end)])
        if (newline < 0) return
        try {
          const message = JSONRPCMessageSchema.parse(JSON.parse(this.buffer.toString("utf8")))
          this.buffer = Buffer.alloc(0)
          this.onmessage?.(message)
        } catch {
          return this.fail()
        }
        offset = newline + 1
      }
    })
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", () => reject(new Error("Unable to start Cua transport")))
    })
  }

  private fail() {
    this.onerror?.(new Error("Cua transport failed or exceeded its response limit"))
    void this.close()
  }

  async send(message: JSONRPCMessage) {
    if (!this.child || this.closed) throw new Error("Transport unavailable")
    const data = JSON.stringify(message) + "\n"
    await new Promise<void>((resolve, reject) => {
      this.child!.stdin.write(data, error => error ? reject(new Error("Transport write failed")) : resolve())
    })
  }

  async close() {
    if (this.closed) return
    this.closed = true
    const child = this.child
    if (!child) return
    child.stdin.destroy()
    child.stdout.destroy()
    child.stderr.destroy()
    child.kill("SIGKILL")
    await new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve()
      const timer = setTimeout(resolve, 1_000)
      child.once("exit", () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function checkSchema(name: Tool, schema: unknown) {
  if (!record(schema) || schema.type !== "object" || !record(schema.properties)) throw new Error("Unsupported Cua tool schema")
  if (Object.keys(schema).some(key => !["type", "properties", "required", "additionalProperties", "description", "title", "$schema"].includes(key))) throw new Error("Unsupported Cua tool schema")
  const sent: Record<Tool, Record<string, string>> = {
    list_apps: {},
    list_windows: {},
    get_window_state: { pid: "integer", window_id: "integer", include_screenshot: "boolean" },
  }
  const properties = schema.properties
  for (const [key, type] of Object.entries(sent[name])) {
    const property = properties[key]
    if (!record(property) || property.type !== type || Object.keys(property).some(field => !["type", "description", "title", "default", "examples"].includes(field))) throw new Error("Unsupported Cua tool schema")
  }
  if (name === "get_window_state") {
    const treeFormat = properties.tree_format
    if (!record(treeFormat) || treeFormat.type !== "string" || !Array.isArray(treeFormat.enum) || !treeFormat.enum.includes("elements")) throw new Error("Unsupported Cua tool schema")
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== "string" || !Object.hasOwn(sent[name], key)))) {
    throw new Error("Unsupported Cua tool schema")
  }
}

export class CuaAdapter {
  private constructor(private client: Client) {}

  static async connect(options: { enabled?: boolean; executablePath?: string; signal?: AbortSignal }) {
    if (options.enabled !== true || !options.executablePath || !isAbsolute(options.executablePath)) throw new Error("Cua is not explicitly configured")
    if (options.signal?.aborted) throw new Error("Cua request cancelled")
    try {
      const info = await stat(options.executablePath)
      if (!info.isFile()) throw new Error()
      await access(options.executablePath, constants.X_OK)
    } catch {
      throw new Error("Cua executable is invalid")
    }
    if (options.signal?.aborted) throw new Error("Cua request cancelled")
    const client = new Client({ name: "supercode-cua", version: "1.0.0" })
    const transport = new BoundedStdio(options.executablePath)
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = () => { void transport.close() }
    options.signal?.addEventListener("abort", abort, { once: true })
    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { void transport.close(); reject(new Error("Cua connection timed out")) }, TIMEOUT_MS) }),
      ])
      if (options.signal?.aborted) throw new Error("Cua request cancelled")
      const catalog = await client.listTools(undefined, { timeout: TIMEOUT_MS, signal: options.signal })
      for (const name of ALLOWED) {
        const matches = catalog.tools.filter(tool => tool.name === name)
        if (matches.length !== 1) throw new Error("Unsupported Cua tool catalog")
        checkSchema(name, matches[0]!.inputSchema)
      }
      return new CuaAdapter(client)
    } catch {
      await transport.close()
      throw new Error("Cua connection failed")
    } finally {
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener("abort", abort)
    }
  }

  async call(name: string, args: unknown, options: { signal?: AbortSignal } = {}) {
    if (!ALLOWED.includes(name as Tool)) throw new Error("Cua tool is not allowed")
    if (options.signal?.aborted) throw new Error("Cua request cancelled")
    if (!record(args)) throw new Error("Invalid Cua arguments")
    let parameters: Record<string, unknown> = {}
    if (name === "get_window_state") {
      if (Object.keys(args).some(key => key !== "pid" && key !== "window_id") || !Number.isSafeInteger(args.pid) || !Number.isSafeInteger(args.window_id) || (args.pid as number) <= 0 || (args.pid as number) > 2147483647 || (args.window_id as number) < 0 || (args.window_id as number) > 4294967295) throw new Error("Invalid Cua arguments")
      parameters = { pid: args.pid, window_id: args.window_id, include_screenshot: false, tree_format: "elements" }
    } else if (Object.keys(args).length) throw new Error("Invalid Cua arguments")
    try {
      const result = await this.client.callTool({ name, arguments: parameters }, undefined, { timeout: TIMEOUT_MS, signal: options.signal })
      if (result.isError) throw new Error()
      const structured = record(result.structuredContent) ? result.structuredContent : {}
      const key = name === "list_apps" ? "apps" : name === "list_windows" ? "windows" : "elements"
      const source = Array.isArray(structured[key]) ? structured[key] : []
      const items = source.slice(0, 100).filter(record).map(item => {
        const safe: Record<string, number | boolean> = {}
        for (const field of ["pid", "window_id", "element_index", "parent_index", "depth", "is_on_screen", "running", "active"]) {
          const value = item[field]
          if ((typeof value === "number" && Number.isSafeInteger(value)) || typeof value === "boolean") safe[field] = value
        }
        return safe
      })
      const metadata: Record<string, number | boolean> = {}
      for (const field of ["pid", "window_id", "truncated", "elements_complete"]) {
        const value = structured[field]
        if ((typeof value === "number" && Number.isSafeInteger(value)) || typeof value === "boolean") metadata[field] = value
      }
      return { items, metadata, itemsAvailable: Array.isArray(structured[key]), truncated: source.length > 100 || structured.truncated === true, image: "unsupported" as const }
    } catch {
      throw new Error(options.signal?.aborted ? "Cua request cancelled" : "Cua request failed")
    }
  }

  async close() { await this.client.close() }
}
