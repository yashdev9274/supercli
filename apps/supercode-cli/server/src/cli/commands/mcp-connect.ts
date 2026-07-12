import { Command } from "commander"
import { theme } from "src/cli/utils/tui"
import chalk from "chalk"

export const mcpConnect = new Command("mcp-connect")
  .description("Configure MCP connections")
  .action(async () => {
    console.log()
    console.log(` ${chalk.hex(theme.amber)("◆")} MCP connections are managed via ${chalk.hex(theme.green)("/mcp")} in chat mode`)
    console.log(` ${chalk.hex(theme.amber)("   ")}Or set ${chalk.hex(theme.green)("COMPOSIO_API_KEY")} in .env and run ${chalk.hex(theme.green)("/mcp")}`)
    console.log()
  })
