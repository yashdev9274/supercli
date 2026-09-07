import { defineAgent } from "./lib/define.ts"

/**
 * Primary build agent — full write + exec access.
 * Destructive shell patterns still ask via permission manager.
 */
export const agent = defineAgent({
  name: "build",
  description: "Full-stack application builder with write access. The default agent.",
  mode: "primary",
  steps: 50,
  instructions: "build",
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
