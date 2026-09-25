import { defineAgent } from "../../lib/define.ts"

export const agent = defineAgent({
  name: "general",
  description:
    "General-purpose agent for researching complex questions and executing multi-step tasks.",
  mode: "subagent",
  steps: 20,
  instructions: "general",
  permission: [
    { permission: "*", pattern: "*", action: "allow" },
    {
      permission: "run_command",
      pattern: "rm -rf *",
      action: "ask",
      reason: "Destructive",
    },
  ],
})

export default agent
