import { z } from "zod"

const switchToAgentSchema = z.object({
  reason: z
    .string()
    .describe("Brief explanation of why agent mode is needed for this task"),
})

export type SwitchToAgentArgs = z.infer<typeof switchToAgentSchema>

export const switchToAgentModeTool = {
  description:
    "Request switching from chat mode to agent mode. " +
    "Call this INSTEAD of run_command/write_file/code_exec when the user's task requires " +
    "shell commands, file modifications, or code execution — and doing so in chat mode " +
    "would require per-call permission prompts. " +
    "The system will ask the user for permission to switch, and if approved, " +
    "will re-run your task in agent mode where all tools are auto-allowed. " +
    "Do NOT also call run_command/write_file/code_exec in the same response — " +
    "let the agent mode handle it.",
  parameters: switchToAgentSchema,
  execute: async ({ reason }: SwitchToAgentArgs) => {
    return JSON.stringify({
      success: true,
      modeSwitchRequested: true,
      reason,
      message:
        "Mode switch requested. The system will ask the user for approval.",
    })
  },
}