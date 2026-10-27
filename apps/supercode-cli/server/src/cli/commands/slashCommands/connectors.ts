import { password, text, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { theme, heavyDivider } from "src/cli/utils/tui"
import {
  mergeConnectorManager,
  BUILTIN_CONNECTORS,
  type ConnectorEntry,
} from "src/connectors"
import { getMcpManager } from "src/mcp/mcp-manager"
import { saveCliConfig } from "src/lib/cli-config"

function renderConnectorTable(entries: ConnectorEntry[]): void {
  const divider = heavyDivider()
  process.stdout.write(`\r\n${divider}\r\n`)
  process.stdout.write(` ${chalk.hex(theme.amber)("❯")} App Connectors\r\n`)
  process.stdout.write(`${divider}\r\n`)

  for (const e of entries) {
    const statusDot =
      e.status === "connected"
        ? chalk.green("●")
        : e.status === "error"
          ? chalk.red("●")
          : chalk.dim("○")

    const name = chalk.bold(e.name.padEnd(36))

    process.stdout.write(
      ` ${statusDot} ${name} ${chalk.hex(theme.muted)(e.detail)}\r\n`,
    )
  }

  process.stdout.write(`${divider}\r\n`)
}

export async function connectorsCommand(
  args: string,
): Promise<
  { type: "message"; message: string } | { type: "help" }
> {
  const connected = getMcpManager().connectedServers.includes("mergedev")
  const allEntries: ConnectorEntry[] = [
    {
      slug: "mergedev",
      name: "Merge Agent Handler",
      description: "Connect tools from your Merge Tool Pack.",
      provider: "mergedev",
      category: "search",
      status: connected ? "connected" : "disconnected",
      detail: connected ? "Tool Pack connected" : "Run /connectors connect to set up",
    },
    ...BUILTIN_CONNECTORS,
  ]

  if (args === "list" || !args) {
    renderConnectorTable(allEntries)
    return { type: "help" }
  }

  if (args.startsWith("connect")) {
    const ahKey =
      process.env.MERGE_AH_API_KEY
    const toolPackId =
      process.env.MERGE_TOOL_PACK_ID
    const registeredUserId =
      process.env.MERGE_REGISTERED_USER_ID

    if (ahKey && toolPackId && registeredUserId) {
      mergeConnectorManager.setConfig({
        agentHandlerApiKey: ahKey,
        toolPackId,
        registeredUserId,
      })
    }

    if (!mergeConnectorManager.isConfigured || !mergeConnectorManager.getMcpConfig()) {
      process.stdout.write(
        `\r\n ${chalk.hex(theme.amber)("!")} Merge Agent Handler setup required\r\n\r\n`,
      )
      process.stdout.write(
        ` 1. ${chalk.bold("Sign up")} at ${chalk.cyan("https://ah.merge.dev")}\r\n`,
      )
      process.stdout.write(
        ` 2. Create a ${chalk.bold("Tool Pack")} with Exa and/or Firecrawl connectors\r\n`,
      )
      process.stdout.write(
        ` 3. Create a ${chalk.bold("Registered User")} for the tool pack\r\n`,
      )
      process.stdout.write(
        ` 4. Copy the ${chalk.bold("AH API Key")}, Tool Pack ID, and Registered User ID\r\n`,
      )
      process.stdout.write(
        ` 5. Add to your .env or run setup below\r\n\r\n`,
      )

      const envKey = await password({
        message: "Merge Agent Handler API key:",
        validate: (v) => (v ? undefined : "Required"),
      })
      if (isCancel(envKey)) return { type: "help" }

      const envPack = await text({
        message: "Tool Pack ID:",
        validate: (v) => (v ? undefined : "Required"),
      })
      if (isCancel(envPack)) return { type: "help" }

      const envUser = await text({
        message: "Registered User ID:",
        validate: (v) => (v ? undefined : "Required"),
      })
      if (isCancel(envUser)) return { type: "help" }

      mergeConnectorManager.setConfig({
        agentHandlerApiKey: envKey,
        toolPackId: envPack,
        registeredUserId: envUser,
      })
    }

    try {
      const mcpConfig = mergeConnectorManager.getMcpConfig()
      if (!mcpConfig) throw new Error("Merge Agent Handler is not configured")
      await getMcpManager().reconnectServer("mergedev", mcpConfig)

      await saveCliConfig({
        connectorConfigs: {
          mergedev: {
            provider: "mergedev",
            enabled: true,
          },
        },
      })

      process.stdout.write(
        ` ${chalk.green("✓")} Merge Agent Handler connected.\r\n` +
          `    Tools from your configured Tool Pack are available.\r\n`,
      )
    } catch (err: any) {
      process.stdout.write(
        ` ${chalk.red("✗")} Connection failed: ${err.message}\r\n`,
      )
    }

    return { type: "help" }
  }

  if (args === "disconnect") {
    const mgr = getMcpManager()
    await mgr.stopServer("mergedev")

    await saveCliConfig({
      connectorConfigs: {
        mergedev: {
          provider: "mergedev",
          enabled: false,
        },
      },
    })

    process.stdout.write(
      ` ${chalk.dim("○")} Merge Agent Handler disconnected.\r\n`,
    )
    return { type: "help" }
  }

  return {
    type: "message",
    message: `Usage: /connectors [list|connect|disconnect]`,
  }
}
