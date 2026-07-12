import { createMCPClient } from "@ai-sdk/mcp"
import { composioSessionManager } from "./composio.ts"

// ---------------------------------------------------------------------------
// SDK loader workaround for stdio transports
// bun 1.3.5 cannot resolve @modelcontextprotocol/sdk subpath exports
// ("./*" wildcard pattern). We load the ESM dist via file:// URLs instead.
// ---------------------------------------------------------------------------
let _Client: any = null
let _StdioClientTransport: any = null

const SDK_ROOT = new URL(
  "../../node_modules/@modelcontextprotocol/sdk/dist/esm",
  import.meta.url,
).href

async function ensureSdk(): Promise<void> {
  if (_Client) return
  const [clientMod, stdioMod] = await Promise.all([
    import(`${SDK_ROOT}/client/index.js`),
    import(`${SDK_ROOT}/client/stdio.js`),
  ])
  _Client = clientMod.Client
  _StdioClientTransport = stdioMod.StdioClientTransport
}

function getClient(): any {
  if (!_Client) throw new Error("SDK not loaded — call ensureSdk() first")
  return _Client
}

function getStdioTransport(): any {
  if (!_StdioClientTransport) throw new Error("SDK not loaded — call ensureSdk() first")
  return _StdioClientTransport
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  /** Optional HTTP headers for SSE/HTTP connections (e.g. Authorization) */
  headers?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type McpToolSet = Record<string, any>

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance: McpManager | null = null

export function getMcpManager(): McpManager {
  if (!instance) {
    instance = new McpManager()
  }
  return instance
}

export function resetMcpManager(): void {
  if (instance) {
    instance.stop().catch(() => {})
    instance = null
  }
}

export class McpManager {
  private servers: Map<string, {
    name: string
    config: McpServerConfig
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transport?: any
  }> = new Map()
  private started = false

  get isStarted(): boolean {
    return this.started
  }

  get connectedServers(): string[] {
    return Array.from(this.servers.keys())
  }

  async start(configs: Record<string, McpServerConfig>): Promise<void> {
    if (this.started) return

    const entries = Object.entries(configs)
    if (entries.length === 0) return

    await Promise.all(
      entries.map(([name, cfg]) => this.connectServer(name, cfg)),
    )

    this.started = true
  }

  private async connectServer(
    name: string,
    config: McpServerConfig,
  ): Promise<void> {
    if (this.servers.has(name)) return

    if (config.url) {
      // Use @ai-sdk/mcp for HTTP/SSE connections
      const client = await createMCPClient({
        name: "supercode-cli",
        version: "0.1.0",
        transport: {
          type: config.url.endsWith("/sse") ? "sse" : "http",
          url: config.url,
          headers: config.headers,
        },
      })
      this.servers.set(name, { name, config, client })
    } else if (config.command) {
      // Use raw MCP SDK for stdio connections
      await ensureSdk()
      const Client = getClient()
      const StdioClientTransport = getStdioTransport()

      const client = new Client(
        { name: "supercode-cli", version: "0.1.0" },
        { capabilities: {} },
      )

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
        stderr: "pipe",
      })

      await client.connect(transport)
      this.servers.set(name, { name, config, client, transport })
    } else {
      throw new Error(
        `MCP server "${name}" has no command or url — specify one`,
      )
    }
  }

  /**
   * Connect or reconnect a server at any time, even after initial start().
   * Unlike start(), this bypasses the `started` guard so it works for
   * reconnecting a server (e.g. after composio OAuth) or adding a new one.
   */
  async reconnectServer(name: string, config: McpServerConfig): Promise<void> {
    // Close existing connection if present
    if (this.servers.has(name)) {
      await this.stopServer(name)
    }
    await this.connectServer(name, config)
    this.started = true
  }

  async getTools(name: string): Promise<McpToolSet> {
    const state = this.servers.get(name)
    if (!state) return {}

    const { client } = state

    if (state.config.url) {
      // @ai-sdk/mcp client — use .tools() which returns Record<string, Tool>
      try {
        return await client.tools()
      } catch {
        return {}
      }
    }

    // Raw MCP SDK client — use listTools() then convert
    try {
      const result = await client.listTools()
      const toolSet: McpToolSet = {}

      for (const t of result.tools) {
        const schema = (t.inputSchema ?? {
          type: "object",
          properties: {},
        }) as Record<string, unknown>
        const zodSchema = jsonSchemaToZod(schema)
        toolSet[`mcp_${name}_${t.name}`] = {
          description: t.description ?? `MCP tool: ${name}/${t.name}`,
          inputSchema: zodSchema,
          execute: async (args: Record<string, unknown>) => {
            const callResult = await client.callTool({
              name: t.name,
              arguments: args,
            })
            const textParts: string[] = []
            for (const content of callResult.content) {
              if (content.type === "text") {
                textParts.push(content.text)
              }
            }
            return textParts.join("\n") || JSON.stringify(callResult)
          },
        }
      }
      return toolSet
    } catch {
      return {}
    }
  }

  async getAllTools(): Promise<McpToolSet> {
    if (!this.started) return {}

    const names = Array.from(this.servers.keys())
    const results = await Promise.all(
      names.map((n) => this.getTools(n)),
    )

    const merged: McpToolSet = {}
    for (const ts of results) {
      Object.assign(merged, ts)
    }
    return merged
  }

  async stop(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.values()).map(async (state) => {
        try {
          await state.client.close()
        } catch {
          // swallow close errors — server may already be dead
        }
      }),
    )
    this.servers.clear()
    this.started = false
  }

  async stopServer(name: string): Promise<boolean> {
    const state = this.servers.get(name)
    if (!state) return false
    try {
      await state.client.close()
    } catch {}
    this.servers.delete(name)
    if (this.servers.size === 0) this.started = false
    return true
  }
}

function jsonSchemaToZod(
  schema: Record<string, unknown>,
): any {
  if (!schema || schema.type !== "object") {
    return { type: "object", properties: {}, required: [], additionalProperties: true }
  }

  const properties = (schema.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >
  const required = (schema.required ?? []) as string[]
  const shape: Record<string, any> = {}

  for (const [key, prop] of Object.entries(properties)) {
    let field: any

    switch (prop.type) {
      case "string":
        field = { type: "string" }
        break
      case "number":
      case "integer":
        field = { type: "number" }
        break
      case "boolean":
        field = { type: "boolean" }
        break
      case "array": {
        const items = prop.items as Record<string, unknown> | undefined
        field = {
          type: "array",
          items: items ? jsonSchemaToZod(items) : { type: "unknown" },
        }
        break
      }
      default:
        field = { type: "unknown" }
    }

    if (typeof prop.description === "string") {
      field.description = prop.description
    }

    if (!required.includes(key)) {
      field.optional = true
    }

    shape[key] = field
  }

  return { type: "object", properties: shape, required: [] }
}
