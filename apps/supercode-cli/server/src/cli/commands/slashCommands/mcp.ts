import * as readline from "node:readline"
import { select, text, isCancel } from "@clack/prompts"
import chalk from "chalk"
let _mgr: any = null
async function mcpManager(): Promise<any> {
  if (!_mgr) {
    const mod = await import("src/mcp/mcp-manager")
    _mgr = mod.getMcpManager()
  }
  return _mgr
}

interface _McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
}
import { getCliConfig, saveCliConfig } from "src/lib/cli-config"
import { composioSessionManager, type AppEntry } from "src/mcp/composio"
import { theme, heavyDivider } from "src/cli/utils/tui"

interface ListEntry {
  id: string
  name: string
  type: "composio" | "composio-app" | "stdio" | "sse"
  status: "connected" | "configured" | "disconnected"
  detail: string
  appSlug?: string
  parent?: string
}

class McpPicker {
  entries: ListEntry[] = []
  selected = 0
  overlayLines = 0

  async refresh(): Promise<void> {
    const list: ListEntry[] = []

    const mgr = await mcpManager()
    const connected = mgr.connectedServers

    const config = await getCliConfig()
    const rawConfig = (config as Record<string, any>) ?? {}
    const servers = (rawConfig.mcpServers ?? {}) as Record<string, _McpServerConfig>

    if (composioSessionManager.isConfigured) {
      try {
        const apps = await composioSessionManager.listApps()
        for (const app of apps) {
          list.push({
            id: `app:${app.slug}`,
            name: app.name,
            type: "composio-app",
            status: app.connected ? "connected" : "disconnected",
            detail: app.connected ? "OAuth connected" : "click to connect with OAuth",
            appSlug: app.slug,
          })
        }
      } catch {
        // API call failed — show generic entry
        list.push({
          id: "composio",
          name: "composio",
          type: "composio",
          status: "disconnected",
          detail: "API key set — connect to start",
        })
      }
    } else {
      // No local API key — try server-side proxy
      try {
        const apps = await composioSessionManager.listAppsFromServer()
        for (const app of apps) {
          list.push({
            id: `app:${app.slug}`,
            name: app.name,
            type: "composio-app",
            status: app.connected ? "connected" : "disconnected",
            detail: app.connected ? "OAuth connected" : "click to connect with OAuth",
            appSlug: app.slug,
          })
        }
      } catch {
        // server-side also unavailable — no composio apps shown
      }
    }

    for (const [name, srv] of Object.entries(servers)) {
      const isConnected = connected.includes(name)
      list.push({
        id: `raw:${name}`,
        name,
        type: srv.url ? "sse" : "stdio",
        status: isConnected ? "connected" : "configured",
        detail: srv.url ? srv.url : `cmd: ${srv.command}`,
      })
    }

    this.entries = list
  }

  render(cols: number): string[] {
    const lines: string[] = []
    const total = this.entries.length

    const divider = heavyDivider()
    lines.push(divider)
    lines.push(` ${chalk.hex(theme.amber)("❯")} ${chalk.hex(theme.green).bold("/mcp")} — MCP Connections`)
    lines.push(divider)

    const addLabel = "➕ Connect New MCP Server"
    if (this.selected === -1) {
      const bg = chalk.bgHex(theme.greenDeep)
      lines.push(bg(` ${chalk.hex(theme.amber)("▸")} ${addLabel}`.padEnd(cols)))
    } else {
      lines.push(`   ${addLabel}`)
    }

    for (let i = 0; i < total; i++) {
      const e = this.entries[i]!
      const isSel = this.selected === i
      const prefix = isSel ? chalk.hex(theme.amber)("▸") : " "

      let icon: string
      let statusStr: string
      if (e.status === "connected") {
        icon = chalk.hex(theme.green)("●")
        statusStr = chalk.hex(theme.green)("connected")
      } else if (e.status === "disconnected") {
        icon = chalk.hex(theme.red)("○")
        statusStr = chalk.hex(theme.red)("disconnected")
      } else {
        icon = chalk.hex(theme.amber)("○")
        statusStr = chalk.hex(theme.amber)("configured")
      }

      let typeTag: string
      if (e.type === "composio") {
        typeTag = chalk.hex(theme.greenMute)("composio")
      } else if (e.type === "composio-app") {
        typeTag = chalk.hex(theme.greenMute)("app")
      } else if (e.type === "stdio") {
        typeTag = chalk.hex(theme.greenMute)("stdio")
      } else {
        typeTag = chalk.hex(theme.greenMute)("sse")
      }

      const label = ` ${prefix} ${icon} ${chalk.hex(theme.green)(e.name.padEnd(18))} ${typeTag} ${statusStr}`
      const detailLine = `   ${chalk.hex(theme.muted)(e.detail)}`

      if (isSel) {
        const bg = chalk.bgHex(theme.greenDeep)
        lines.push(bg(label.padEnd(cols)))
        lines.push(bg(detailLine.padEnd(cols)))
      } else {
        lines.push(label)
        lines.push(detailLine)
      }
    }

    if (total === 0) {
      lines.push(` ${chalk.hex(theme.muted)("  no connections yet")}`)
      lines.push(` ${chalk.hex(theme.muted)("  select ") + chalk.hex(theme.green)("➕ Connect New MCP Server") + chalk.hex(theme.muted)(" above")}`)
    }

    lines.push(divider)
    lines.push(` ${chalk.hex(theme.muted)("⬆⬇ Navigate  ·  Enter Connect/Detail  ·  Space Toggle  ·  q Quit")}`)
    lines.push(divider)
    this.overlayLines = lines.length
    return lines
  }

  selectNext(): void {
    const max = this.entries.length - 1
    if (this.selected < max) {
      this.selected++
    }
  }

  selectPrev(): void {
    if (this.selected > -1) {
      this.selected--
    }
  }

  getSelectedEntry(): ListEntry | null {
    if (this.selected === -1) return null
    return this.entries[this.selected] ?? null
  }
}

function readRawKey(): Promise<"up" | "down" | "enter" | "escape" | "space" | "r"> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0)

    const handler = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const b = Array.from(buf)

      if (b.length === 1 && (b[0] === 0x0d || b[0] === 0x0a)) {
        cleanup(); resolve("enter"); return
      }
      if (b.length === 1 && b[0] === 0x20) {
        cleanup(); resolve("space"); return
      }
      if (b.length === 1 && b[0] === 0x72) {
        cleanup(); resolve("r"); return
      }
      if (b.length === 1 && (b[0] === 0x71 || b[0] === 0x1b)) {
        cleanup(); resolve("escape"); return
      }
      if (b[0] === 0x1b && b.length >= 2) {
        if (b[1] === 0x5b && b.length >= 3) {
          if (b[2] === 0x41) { cleanup(); resolve("up"); return }
          if (b[2] === 0x42) { cleanup(); resolve("down"); return }
          cleanup(); resolve("escape"); return
        }
        cleanup(); resolve("escape"); return
      }
      if (b.length === 1 && b[0] === 0x1b) return
      if (b.length === 1 && b[0] === 0x6a) { cleanup(); resolve("down"); return }
      if (b.length === 1 && b[0] === 0x6b) { cleanup(); resolve("up"); return }
      cleanup()
      process.stdin.once("data", handler)
    }

    const timeout = setTimeout(() => {
      if (buf.length === 1 && buf[0] === 0x1b) {
        cleanup(); resolve("escape")
      } else {
        process.stdin.once("data", handler)
      }
    }, 80)

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener("data", handler)
    }

    process.stdin.once("data", handler)
  })
}

function clearLines(n: number): void {
  for (let i = 0; i < n; i++) {
    readline.moveCursor(process.stdout, 0, -1)
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
  }
}

async function buildServerConfig(entry: ListEntry): Promise<_McpServerConfig | null> {
  if (entry.type === "composio") {
    const info = composioSessionManager.connectionInfo
    if (!info) return null
    return {
      url: info.url,
      headers: info.headers,
    }
  }

  const config = await getCliConfig()
  const servers = ((config as Record<string, any>)?.mcpServers ?? {}) as Record<string, _McpServerConfig>
  return servers[entry.name] ?? null
}

async function connectFlow(): Promise<void> {
  process.stdout.write("\n")

  if (composioSessionManager.isConfigured) {
    let apps: AppEntry[] = []
    try {
      apps = await composioSessionManager.listApps()
    } catch {}

    const disconnected = apps.filter((a) => !a.connected)

    const options: { value: string; label: string; hint?: string }[] = [
      ...disconnected.map((a) => ({
        value: a.slug,
        label: a.name,
        hint: a.description || a.slug,
      })),
      { value: "__custom__", label: "Custom server (stdio, SSE/HTTP)" },
      { value: "__cancel__", label: "Cancel" },
    ]

    if (disconnected.length > 0) {
      console.log(` ${chalk.hex(theme.amber)("◆")} Select an app to connect via OAuth 2.0`)
    }

    const selected = await select({
      message: "Available apps",
      options,
    })

    if (isCancel(selected) || selected === "__cancel__") return

    if (selected !== "__custom__") {
      try {
        if (!composioSessionManager.isConnected) {
          const mgr = await mcpManager()
          const info = await composioSessionManager.createSession("supercode-cli")
          const config = await getCliConfig()
          const existing = (config as Record<string, any>) ?? {}
          await saveCliConfig({
            ...existing as any,
            composioSessionId: info.sessionId,
          } as any)
          await mgr.reconnectServer("composio", { url: info.url, headers: info.headers })
        }
      } catch {}

      await oauthConnectAppFlow(selected as string)
      return
    }
  }

  const connType = await select({
    message: "Connection type",
    options: [
      ...(!composioSessionManager.isConfigured
        ? [{ value: "composio" as const, label: "Composio (GitHub, Linear, Slack — unified gateway)" }]
        : []),
      { value: "stdio" as const, label: "Stdio (local process — npx, bun, python, etc.)" },
      { value: "sse" as const, label: "SSE / HTTP (remote URL)" },
    ],
  })

  if (isCancel(connType)) return

  if (connType === "composio") {
    const mgr = await mcpManager()

    // Try server-side session first (no local API key needed)
    try {
      const info = await composioSessionManager.createSessionFromServer()
      const config = await getCliConfig()
      const existing = (config as Record<string, any>) ?? {}
      await saveCliConfig({
        ...existing as any,
        composioSessionId: info.sessionId,
      } as any)
      await mgr.reconnectServer("composio", { url: info.url, headers: info.headers })
      const tools = await mgr.getTools("composio")
      console.log(`\n ${chalk.hex(theme.green)("◆")} composio connected — ${Object.keys(tools).length} tools`)
      return
    } catch (err: any) {
      console.log(`\n ${chalk.hex(theme.red)("◆")} composio connection failed: ${err.message}`)
      if (!composioSessionManager.isConfigured) {
        console.log(` ${chalk.hex(theme.muted)("  ")}Set COMPOSIO_API_KEY in .env for local development, or run ${chalk.hex(theme.green)("supercode login")}`)
      }
    }
    return
  }

  const name = (await text({
    message: "Server name",
    placeholder: "my-server",
    validate: (v: string | undefined) => { if (!v?.trim()) return "Name is required" },
  })) as string
  if (isCancel(name)) return

  let server: _McpServerConfig

  if (connType === "sse") {
    const url = (await text({
      message: "Server URL",
      placeholder: "https://example.com/mcp/sse",
      validate: (v: string | undefined) => { if (!v?.trim()) return "URL is required" },
    })) as string
    if (isCancel(url)) return
    server = { url: url.trim() }
  } else {
    const cmd = (await text({
      message: "Command",
      placeholder: "npx -y @modelcontextprotocol/server-filesystem .",
      validate: (v: string | undefined) => { if (!v?.trim()) return "Command is required" },
    })) as string
    if (isCancel(cmd)) return
    const parts = cmd.trim().split(/\s+/)
    const command = parts[0]!
    const args = parts.slice(1)
    const envRaw = (await text({
      message: "Environment variables (optional, KEY=VAL, comma-separated)",
      placeholder: "KEY1=VAL1,KEY2=VAL2",
    })) as string
    if (isCancel(envRaw)) return
    const env: Record<string, string> = {}
    if ((envRaw as string).trim()) {
      for (const pair of (envRaw as string).split(",")) {
        const eq = pair.indexOf("=")
        if (eq > 0) {
          env[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
        }
      }
    }
    server = {
      command,
      args: args.length > 0 ? args : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
    }
    const cwd = (await text({
      message: "Working directory (optional, defaults to cwd)",
      placeholder: "/path/to/dir or leave empty",
    })) as string
    if (isCancel(cwd)) return
    if ((cwd as string).trim()) server.cwd = cwd.trim()
  }

  const config = await getCliConfig()
  const existing = ((config as Record<string, any>) ?? {})
  const servers = { ...((existing.mcpServers ?? {}) as Record<string, _McpServerConfig>), [name]: server }
  await saveCliConfig({
    ...existing as any,
    mcpServers: servers,
  } as any)

  const mgr = await mcpManager()
  try {
    await mgr.reconnectServer(name, server)
    const tools = await mgr.getTools(name)
    const toolCount = Object.keys(tools).length
    console.log(`\n ${chalk.hex(theme.green)("◆")} "${name}" connected — ${toolCount} tool${toolCount === 1 ? "" : "s"}`)
  } catch (err: any) {
    console.log(`\n ${chalk.hex(theme.amber)("◆")} config saved — connection deferred (${err.message})`)
  }
}

async function showDetail(entry: ListEntry): Promise<void> {
  const cols = process.stdout.columns ?? 80
  const divider = heavyDivider()

  console.log(`\n${divider}`)
  console.log(` ${chalk.hex(theme.amber)("❯")} ${chalk.hex(theme.green).bold("MCP Connection Detail")}`)
  console.log(divider)

  const typeLabel = entry.type === "composio" ? "Composio gateway"
    : entry.type === "composio-app" ? "Composio app"
    : entry.type === "stdio" ? "Stdio (local process)"
    : "SSE / HTTP"

  console.log(` ${chalk.hex(theme.green)("Name:".padEnd(12))}${chalk.hex(theme.white)(entry.name)}`)
  console.log(` ${chalk.hex(theme.green)("Type:".padEnd(12))}${chalk.hex(theme.white)(typeLabel)}`)
  console.log(` ${chalk.hex(theme.green)("Status:".padEnd(12))}${entry.status === "connected" ? chalk.hex(theme.green)("● connected") : entry.status === "disconnected" ? chalk.hex(theme.red)("○ disconnected") : chalk.hex(theme.amber)("○ configured")}`)
  console.log(` ${chalk.hex(theme.green)("Detail:".padEnd(12))}${chalk.hex(theme.muted)(entry.detail)}`)

  const mgr = await mcpManager()
  const tools = await mgr.getTools(entry.name)
  const toolNames = Object.keys(tools)
  if (toolNames.length > 0) {
    console.log(`\n ${chalk.hex(theme.green).bold(`Tools (${toolNames.length})`)}`)
    for (const tn of toolNames.slice(0, 10)) {
      console.log(` ${chalk.hex(theme.greenDim)("  •")} ${chalk.hex(theme.muted)(tn)}`)
    }
    if (toolNames.length > 10) {
      console.log(` ${chalk.hex(theme.greenDim)(`  … and ${toolNames.length - 10} more`)}`)
    }
  }

  console.log(`\n ${chalk.hex(theme.muted)("Press space to toggle · r to remove · any other key to return")}`)
  console.log(divider)

  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  const key = await readRawKey()
  let removed = false

  if (key === "space") {
    const mgr = await mcpManager()
    const connected = mgr.connectedServers
    if (connected.includes(entry.name)) {
      await mgr.stopServer(entry.name)
      if (entry.name === "composio") {
        composioSessionManager.resetSession()
      }
      console.log(` ${chalk.hex(theme.amber)("◆")} "${entry.name}" disconnected`)
    } else {
      const cfg = await buildServerConfig(entry)
      if (cfg) {
        try {
          await mgr.reconnectServer(entry.name, cfg)
          const tools = await mgr.getTools(entry.name)
          console.log(` ${chalk.hex(theme.green)("◆")} "${entry.name}" connected — ${Object.keys(tools).length} tools`)
        } catch (err: any) {
          console.log(` ${chalk.hex(theme.red)("◆")} connection failed: ${err.message}`)
        }
      }
    }
  }

  if (key === "escape" || removed) {
    console.log()
  }

  if (key === "r") {
    const config = await getCliConfig()
    const existing = ((config as Record<string, any>) ?? {})

    if (entry.name === "composio") {
      const mgr = await mcpManager()
      await mgr.stopServer("composio")
      composioSessionManager.resetSession()
      await saveCliConfig({
        ...existing as any,
        composioApiKey: undefined,
        composioSessionId: undefined,
      } as any)
    } else {
      const servers = { ...((existing.mcpServers ?? {}) as Record<string, _McpServerConfig>) }
      delete servers[entry.name]
      await saveCliConfig({ ...existing as any, mcpServers: servers } as any)
      const mgr = await mcpManager()
      await mgr.stopServer(entry.name)
    }
    removed = true
    console.log(` ${chalk.hex(theme.green)("◆")} "${entry.name}" removed`)
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
  console.log()
}

async function ensureComposioConnected(): Promise<void> {
  if (composioSessionManager.isConnected) return

  const mgr = await mcpManager()

  // Try server-side first
  try {
    const info = await composioSessionManager.createSessionFromServer()
    await mgr.reconnectServer("composio", { url: info.url, headers: info.headers })
    return
  } catch {
    // server-side failed, try local SDK
  }

  if (!composioSessionManager.isConfigured) return

  try {
    const info = await composioSessionManager.createSession("supercode-cli")
    await mgr.reconnectServer("composio", { url: info.url, headers: info.headers })
  } catch {
    // auto-connect failed — user can manually connect
  }
}

async function showInteractiveList(): Promise<void> {
  await ensureComposioConnected()

  const picker = new McpPicker()
  await picker.refresh()
  const cols = process.stdout.columns ?? 80

  const draw = () => {
    const lines = picker.render(cols)
    for (const line of lines) {
      process.stdout.write(line + "\n")
    }
  }

  process.stdout.write("\n")
  draw()

  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  try {
    while (true) {
      const key = await readRawKey()

      if (key === "escape") {
        break
      }

      if (key === "up") {
        picker.selectPrev()
        clearLines(picker.overlayLines)
        draw()
        continue
      }

      if (key === "down") {
        picker.selectNext()
        clearLines(picker.overlayLines)
        draw()
        continue
      }

      if (key === "enter") {
        clearLines(picker.overlayLines + 1)

        try {
          if (picker.selected === -1) {
            await connectFlow()
          } else {
            const entry = picker.getSelectedEntry()
            if (entry && entry.type === "composio-app" && entry.status === "disconnected" && entry.appSlug) {
              await oauthConnectAppFlow(entry.appSlug)
            } else if (entry) {
              await showDetail(entry)
            }
          }
        } catch {
          // @clack/prompts may leave stdin paused; ensure it's flowing
        }

        await picker.refresh()

        if (process.stdin.isTTY) process.stdin.setRawMode(true)
        process.stdout.write("\n")
        draw()
        continue
      }

      if (key === "space") {
        const entry = picker.getSelectedEntry()
        if (entry) {
          const mgr = await mcpManager()
          const connected = mgr.connectedServers

          if (connected.includes(entry.name)) {
            await mgr.stopServer(entry.name)
            if (entry.name === "composio") {
              composioSessionManager.resetSession()
            }
          } else {
            const cfg = await buildServerConfig(entry)
            if (cfg) {
              try {
                await mgr.reconnectServer(entry.name, cfg)
              } catch {}
            }
          }

          await picker.refresh()
          clearLines(picker.overlayLines)
          draw()
        }
        continue
      }
    }
  } finally {
    if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
    process.stdin.resume()
    clearLines(picker.overlayLines + 1)
  }
}

async function oauthConnectAppFlow(slug: string): Promise<void> {
  const divider = heavyDivider()
  console.log(`\n${divider}`)
  console.log(` ${chalk.hex(theme.amber)("❯")} ${chalk.hex(theme.green).bold(`Connecting ${slug}`)}`)
  console.log(divider)

  try {
    const { redirectUrl, waitForActive } = await composioSessionManager.connectApp(slug)

    if (redirectUrl) {
      console.log(` ${chalk.hex(theme.green)("◆")} Opening browser for OAuth...`)
      const cp = await import("node:child_process")
      const { spawn } = cp
      spawn("open", [redirectUrl], { stdio: "ignore", detached: true }).unref()
      console.log(` ${chalk.hex(theme.muted)("  ")}${redirectUrl}`)
    }

    console.log(` ${chalk.hex(theme.amber)("◆")} Waiting for OAuth to complete...`)

    const mgr = await mcpManager()

    try {
      await waitForActive()
      console.log(` ${chalk.hex(theme.green)("◆")} ${slug} connected via OAuth!`)

      // Re-create the session so it picks up the new connected account
      await composioSessionManager.resetSession()
      const info = await composioSessionManager.createSession("supercode-cli")
      const config = await getCliConfig()
      const existing = (config as Record<string, any>) ?? {}
      await saveCliConfig({
        ...existing as any,
        composioSessionId: info.sessionId,
      } as any)
      await mgr.reconnectServer("composio", { url: info.url, headers: info.headers })
      const tools = await mgr.getTools("composio")
      console.log(` ${chalk.hex(theme.green)("◆")} composio refreshed — ${Object.keys(tools).length} tools`)
    } catch (err: any) {
      console.log(` ${chalk.hex(theme.red)("◆")} OAuth did not complete: ${err.message}`)
      console.log(` ${chalk.hex(theme.muted)("  ")}If you completed the browser flow, try pressing r to reconnect composio`)
    }
  } catch (err: any) {
    console.log(` ${chalk.hex(theme.red)("◆")} Failed to initiate OAuth: ${err.message}`)
  }

  console.log(`\n ${chalk.hex(theme.muted)("Press any key to return")}`)

  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  await readRawKey()
  if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
}

export async function mcpCommand(args: string): Promise<{ type: "help" }> {
  const trimmed = args.trim().toLowerCase()

  if (!trimmed) {
    await showInteractiveList()
    return { type: "help" }
  }

  if (trimmed === "list" || trimmed === "ls") {
    await listMcpServers()
    return { type: "help" }
  }

  if (trimmed === "add") {
    await connectFlow()
    return { type: "help" }
  }

  if (trimmed === "remove" || trimmed === "rm") {
    await removeMcp()
    return { type: "help" }
  }

  if (trimmed === "connect" || trimmed === "start") {
    await connectServer()
    return { type: "help" }
  }

  if (trimmed === "disconnect" || trimmed === "stop") {
    await disconnectServer()
    return { type: "help" }
  }

  showMcpHelp()
  return { type: "help" }
}

async function listMcpServers(): Promise<void> {
  await ensureComposioConnected()

  const config = await getCliConfig()
  const raw = (config as Record<string, any>) ?? {}
  const servers = (raw.mcpServers ?? {}) as Record<string, _McpServerConfig>

  const mgr = await mcpManager()
  const connected = mgr.connectedServers

  const divider = heavyDivider()
  process.stdout.write(`\r\n${divider}\r\n`)
  process.stdout.write(` ${chalk.hex(theme.amber)("❯")} ${chalk.hex(theme.green).bold("/mcp")} — MCP Servers\r\n`)
  process.stdout.write(`${divider}\r\n`)

  const hasAny = composioSessionManager.isConfigured || Object.keys(servers).length > 0
  if (!hasAny) {
    process.stdout.write(` ${chalk.hex(theme.muted)("no MCP servers configured")}\r\n`)
    process.stdout.write(` ${chalk.hex(theme.muted)("use")} /mcp add ${chalk.hex(theme.muted)("to add one")}\r\n`)
    process.stdout.write(`${divider}\r\n`)
    return
  }

  if (composioSessionManager.isConnected) {
    const apps = await composioSessionManager.listApps()
    for (const app of apps) {
      const status = app.connected
        ? chalk.hex(theme.green)("● connected")
        : chalk.hex(theme.red)("○ disconnected")
      process.stdout.write(` ${chalk.hex(theme.greenMute)("app".padEnd(8))} ${chalk.hex(theme.green)(app.name.padEnd(16))}${status}\r\n`)
      process.stdout.write(` ${chalk.hex(theme.greenDim)("  ")}${chalk.hex(theme.muted)(app.description || app.slug)}\r\n`)
    }
  } else if (composioSessionManager.isConfigured) {
    process.stdout.write(` ${chalk.hex(theme.red)("○")} ${chalk.hex(theme.green)("composio".padEnd(18))}${chalk.hex(theme.red)("disconnected")}\r\n`)
    process.stdout.write(` ${chalk.hex(theme.greenDim)("  ")}${chalk.hex(theme.muted)("API key set — use /mcp add composio to connect")}\r\n`)
  }

  for (const [name, srv] of Object.entries(servers)) {
    const status = connected.includes(name)
      ? chalk.hex(theme.green)("● connected")
      : chalk.hex(theme.amber)("○ configured")
    const transport = srv.url ? "sse" : "stdio"
    process.stdout.write(` ${chalk.hex(theme.greenMute)(transport.padEnd(8))} ${chalk.hex(theme.green)(name.padEnd(16))}${status}\r\n`)
    process.stdout.write(` ${chalk.hex(theme.greenDim)("  ")}${chalk.hex(theme.muted)(srv.url ?? `cmd: ${srv.command}`)}\r\n`)
  }

  process.stdout.write(`${divider}\r\n`)
}

async function removeMcp(): Promise<void> {
  const config = await getCliConfig()
  const raw = (config as Record<string, any>) ?? {}
  const servers = (raw.mcpServers ?? {}) as Record<string, _McpServerConfig>

  if (!composioSessionManager.isConfigured && (!servers || Object.keys(servers).length === 0)) {
    process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} no servers configured\r\n`)
    return
  }

  const name = await select({
    message: "Select server to remove",
    options: Object.keys(servers).map((n) => ({ value: n, label: n })),
  })

  if (isCancel(name)) return
  const srvName = name as string

  const existing = { ...servers }
  delete existing[srvName]

  await saveCliConfig({
    ...raw as any,
    mcpServers: existing,
  } as any)

  const mgr = await mcpManager()
  await mgr.stopServer(srvName)

  process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} "${srvName}" removed\r\n`)
}

async function connectServer(): Promise<void> {
  const config = await getCliConfig()
  const raw = (config as Record<string, any>) ?? {}
  const servers = (raw.mcpServers ?? {}) as Record<string, _McpServerConfig>

  if (Object.keys(servers).length === 0) {
    process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} no servers configured\r\n`)
    return
  }

  const mgr = await mcpManager()
  const connected = mgr.connectedServers
  const available = Object.keys(servers).filter((n) => !connected.includes(n))

  if (available.length === 0) {
    process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} all servers already connected\r\n`)
    return
  }

  const name = await select({
    message: "Select server to connect",
    options: available.map((n) => ({ value: n, label: n })),
  })

  if (isCancel(name)) return
  const srvName = name as string

  try {
    await mgr.reconnectServer(srvName, servers[srvName]!)
    const tools = await mgr.getTools(srvName)
    process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} "${srvName}" connected — ${Object.keys(tools).length} tools\r\n`)
  } catch (err: any) {
    process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} connection failed: ${err.message}\r\n`)
  }
}

async function disconnectServer(): Promise<void> {
  const mgr = await mcpManager()
  const connected = mgr.connectedServers

  if (connected.length === 0) {
    process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} no servers connected\r\n`)
    return
  }

  const name = await select({
    message: "Select server to disconnect",
    options: connected.map((n: string) => ({ value: n, label: n })),
  })

  if (isCancel(name)) return
  await mgr.stopServer(name as string)
  if (name === "composio") {
    composioSessionManager.resetSession()
  }
  process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} "${name}" disconnected\r\n`)
}

function showMcpHelp(): void {
  const divider = heavyDivider()
  const muted = chalk.hex(theme.muted)
  const green = chalk.hex(theme.green)
  process.stdout.write(`\r\n${divider}\r\n`)
  process.stdout.write(` ${chalk.hex(theme.amber)("❯")} ${chalk.hex(theme.green).bold("/mcp")} — MCP Server Management\r\n`)
  process.stdout.write(`${divider}\r\n`)
  process.stdout.write(` ${green("/mcp")}${muted("                          ")}interactive connection manager\r\n`)
  process.stdout.write(` ${green("/mcp add")}${muted("                       ")}add & connect a new server\r\n`)
  process.stdout.write(` ${green("/mcp list")}${muted("                      ")}list configured servers\r\n`)
  process.stdout.write(` ${green("/mcp connect")}${muted("                   ")}connect a configured server\r\n`)
  process.stdout.write(` ${green("/mcp disconnect")}${muted("                ")}disconnect a server\r\n`)
  process.stdout.write(` ${green("/mcp remove")}${muted("                    ")}remove a server\r\n`)
  process.stdout.write(`${divider}\r\n`)
}
