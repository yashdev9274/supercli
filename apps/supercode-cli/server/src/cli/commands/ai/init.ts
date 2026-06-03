import chalk from "chalk";
import yoctoSpinner from "yocto-spinner";
import { Command } from "commander"
import { getStoredToken } from "src/lib/token"
import prisma from "@super/db-terminal"
import { select } from "@clack/prompts";

export const wakeUpAction = async () => {
  const token = await getStoredToken();

  if (!token?.access_token) {
    console.log(chalk.red("Not Authenticated. please Login"));
    return;
  }

  const spinner = yoctoSpinner({ text: "Fetching user information..." });
  spinner.start();

  const user = await prisma.user.findFirst({
    where: {
      sessions: {
        some: {
          token: token.access_token,
        },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
    },
  });

  spinner.stop();

  if (!user) {
    console.log(chalk.red("User not found."));
    return;
  }

  console.log(chalk.green("Wakeup successful!"));

  const choice = await select({
    message: "Select an Option:",
    options: [
      {
        value: "chat",
        label: "Chat",
        hint: "Simple chat with AI",
      },
      {
        value: "tools",
        label: "Tools",
        hint: "Chat with tools (Google Search, Code Execution)",
      },
      {
        value: "agent",
        label: "Agentic Mode",
        hint: "Advanced AI agent (Coming soon)",
      },
    ],
  });

  switch (choice) {
    case "chat":
      console.log("Chat is selected");
      break;
    case "tools":
      console.log(chalk.green("Tool calling is selected"));
      break;
    case "agent":
      console.log(chalk.yellow("Agentic mode coming soon"));
      break;
  }
  
  
};

export const supercodeInit = new Command("init")
  .description("Start supercode")
  .action(wakeUpAction);
