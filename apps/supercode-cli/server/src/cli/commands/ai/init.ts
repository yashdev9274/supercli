import chalk from "chalk"
import { Command } from "commander"
import { getStoredToken } from "src/lib/token"
import prisma from "@super/db-terminal"
import { select, isCancel } from "@clack/prompts"
import { startChat, type ModelProvider } from "src/cli/ai/chat/chat"
import { theme, frame, createThinking } from "src/cli/utils/tui"

export const wakeUpAction = async () => {
  const token = await getStoredToken()

  if (!token?.access_token) {
    console.log(chalk.hex(theme.red)("Not authenticated. Please login first"))
    return
  }

  const thinking = createThinking("fetching user")
  const user = await prisma.user.findFirst({
    where: {
      sessions: { some: { token: token.access_token } },
    },
    select: { id: true, name: true, email: true, image: true },
  })

  if (!user) {
    thinking.fail("User not found")
    return
  }

  thinking.succeed(`Welcome, ${user.name}`)
  console.log()

  const modelChoice = await select({
    message: chalk.hex(theme.cyan)("select model"),
    options: [
      { value: "google", label: "Gemini 2.5 Flash", hint: "free · fast" },
      { value: "minimax", label: "MiniMax M2", hint: "reasoning · powerful" },
    ],
  })

  if (isCancel(modelChoice)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  console.log()

  const modeChoice = await select({
    message: chalk.hex(theme.cyan)("select mode"),
    options: [
      { value: "chat", label: "Chat", hint: "conversation with AI" },
      { value: "tools", label: "Tools", hint: "AI with search & code execution" },
      { value: "agent", label: "Agent", hint: "autonomous coding agent (coming soon)" },
    ],
  })

  if (isCancel(modeChoice)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  console.log()

  switch (modeChoice) {
    case "chat":
      await startChat(modelChoice as ModelProvider)
      break
    case "tools":
      console.log(frame(` ${chalk.hex(theme.warning)("tools mode coming soon")} `, { borderColor: theme.dim, padding: 0 }))
      break
    case "agent":
      console.log(frame(` ${chalk.hex(theme.warning)("agent mode coming soon")} `, { borderColor: theme.dim, padding: 0 }))
      break
  }
}

export const supercodeInit = new Command("init")
  .description("Start supercode interactive session")
  .action(wakeUpAction)
