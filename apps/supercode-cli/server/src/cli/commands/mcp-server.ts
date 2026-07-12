import { Command } from "commander"
import { getMcpManager, type McpServerConfig } from "src/mcp/mcp-manager"
import { getCliConfig, saveCliConfig } from "src/lib/cli-config"
import { theme, errorBox } from "src/cli/utils/tui"
import chalk from "chalk"
import { createThinking } from "src/cli/utils/tui"

export const mcpServer = new Command("mcp-server")
  .description("Manage raw SDK MCP servers (stdio/http)")
  .argument("[action]", "Action: add | remove | list | start | stop")
  .argument("[name]", "Server name")
  .option("--command <cmd>", "Executable command (for stdio servers)")
  .option("--args <args>", "Comma-separated arguments")
  .option("--url <url>", "Server URL (for HTTP/SSE servers)")
  .option("--env <env>", "Comma-separated KEY=VALUE environment pairs")
  .option("--cwd <dir>", "Working directory for stdio server")
  .action(async (action?: string, name?: string, options?: Record<string, string>) => {
    const opts = options ?? {}

    if (!action || action === "list") {
      await listServers()
      return
    }

    switch (action) {
      case "add":
        await addServer(name, opts)
        break
      case "remove":
        await removeServer(name)
        break
      case "start":
        await startServer(name)
        break
      case "stop":
        await stopServer(name)
        break
      default:
        console.log()
        console.log(errorBox(`Unknown action "${action}". Use add | remove | list | start | stop`))
        console.log()
    }
  })

async function listServers(): Promise<void> {
  const config = await getCliConfig()
  const servers = (config as Record<string, any>)?.mcpServers as
    | Record<string, McpServerConfig>
    | undefined

  const mgr = getMcpManager()
  const connected = mgr.connectedServers

  console.log()
  console.log(` ${chalk.hex(theme.green).bold("MCP Servers")}`)
  console.log(` ${chalk.hex(theme.greenDim)("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`)

  if (!servers || Object.keys(servers).length === 0) {
    console.log(` ${chalk.hex(theme.muted)("  no servers configured")}`)
    console.log(` ${chalk.hex(theme.muted)("  run: supercode mcp-server add <name> --command <cmd>")}`)
    console.log()
    return
  }

  for (const [srvName, srv] of Object.entries(servers)) {
    const status = connected.includes(srvName)
      ? chalk.hex(theme.green)("connected")
      : chalk.hex(theme.amber)("configured")
    const transport = srv.url
      ? `url: ${srv.url}`
      : `cmd: ${srv.command}${srv.args ? ` ${srv.args.join(" ")}` : ""}`
    console.log(` ${chalk.hex(theme.green)(srvName.padEnd(14))}${status}`)
    console.log(` ${chalk.hex(theme.greenDim)("  ")}${chalk.hex(theme.muted)(transport)}`)
  }
  console.log()
}

async function addServer(
  name: string | undefined,
  opts: Record<string, string>,
): Promise<void> {
  if (!name) {
    console.log()
    console.log(errorBox("Server name is required"))
    console.log()
    return
  }

  if (!opts.command && !opts.url) {
    console.log()
    console.log(errorBox("Provide --command <cmd> for stdio or --url <url> for HTTP/SSE"))
    console.log()
    return
  }

  const config = await getCliConfig()
  const existing = (config as Record<string, any>)?.mcpServers ?? {}

  if (existing[name]) {
    console.log()
    console.log(errorBox(`Server "${name}" already exists. Remove it first with: supercode mcp-server remove ${name}`))
    console.log()
    return
  }

  const env: Record<string, string> = {}
  if (opts.env) {
    for (const pair of opts.env.split(",")) {
      const eq = pair.indexOf("=")
      if (eq > 0) {
        env[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
      }
    }
  }

  const argsList = opts.args
    ? opts.args.split(",").map((a) => a.trim()).filter(Boolean)
    : undefined

  const server: McpServerConfig = opts.url
    ? { url: opts.url }
    : {
        command: opts.command!,
        args: argsList,
        env: Object.keys(env).length > 0 ? env : undefined,
        cwd: opts.cwd || undefined,
      }

  await saveCliConfig({
    ...config as any,
    mcpServers: { ...existing, [name]: server },
  } as any)

  const thinking = createThinking("connecting")
  try {
    const mgr = getMcpManager()
    await mgr.reconnectServer(name, server)
    const tools = await mgr.getTools(name)
    const toolCount = Object.keys(tools).length
    thinking.succeed()
    console.log()
    console.log(` ${chalk.hex(theme.green)("◆")} server "${chalk.hex(theme.green)(name)}" added and connected`)
    console.log(` ${chalk.hex(theme.greenDim)("   ")}${toolCount} tool${toolCount === 1 ? "" : "s"} available`)
    console.log()
  } catch (err: any) {
    thinking.fail(`Connection failed: ${err.message}`)
    console.log()
    console.log(` ${chalk.hex(theme.amber)("◆")} server config saved but could not connect`)
    console.log(` ${chalk.hex(theme.amber)("   ")}run ${chalk.hex(theme.green)("supercode mcp-server start " + name)} to retry`)
    console.log()
  }
}

async function removeServer(name: string | undefined): Promise<void> {
  if (!name) {
    console.log()
    console.log(errorBox("Server name is required"))
    console.log()
    return
  }

  const config = await getCliConfig()
  const existing = { ...((config as Record<string, any>)?.mcpServers ?? {}) }

  if (!existing[name]) {
    console.log()
    console.log(errorBox(`Server "${name}" not found in config`))
    console.log()
    return
  }

  delete existing[name]
  await saveCliConfig({
    ...config as any,
    mcpServers: existing,
  } as any)

  const mgr = getMcpManager()
  await mgr.stopServer(name)

  console.log()
  console.log(` ${chalk.hex(theme.green)("◆")} server "${chalk.hex(theme.green)(name)}" removed`)
  console.log()
}

async function startServer(name: string | undefined): Promise<void> {
  if (!name) {
    console.log()
    console.log(errorBox("Server name is required"))
    console.log()
    return
  }

  const config = await getCliConfig()
  const servers = (config as Record<string, any>)?.mcpServers as
    | Record<string, McpServerConfig>
    | undefined

  const server = servers?.[name]
  if (!server) {
    console.log()
    console.log(errorBox(`Server "${name}" not found in config`))
    console.log()
    return
  }

  const thinking = createThinking("connecting")
  try {
    const mgr = getMcpManager()
    await mgr.reconnectServer(name, server)
    const tools = await mgr.getTools(name)
    const toolCount = Object.keys(tools).length
    thinking.succeed()
    console.log()
    console.log(` ${chalk.hex(theme.green)("◆")} "${name}" connected — ${toolCount} tool${toolCount === 1 ? "" : "s"}`)
    console.log()
  } catch (err: any) {
    thinking.fail(err.message)
    console.log()
  }
}

async function stopServer(name: string | undefined): Promise<void> {
  if (!name) {
    console.log()
    console.log(errorBox("Server name is required"))
    console.log()
    return
  }

  const mgr = getMcpManager()
  const ok = await mgr.stopServer(name)
  if (ok) {
    console.log()
    console.log(` ${chalk.hex(theme.green)("◆")} "${name}" disconnected`)
    console.log()
  } else {
    console.log()
    console.log(errorBox(`Server "${name}" is not connected`))
    console.log()
  }
}
