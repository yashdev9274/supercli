import { defineAgent } from "../../lib/define.ts"

export const agent = defineAgent({
  name: "summary",
  description: "Internal agent for summary.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0,
  instructions: "summary",
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
})

export default agent
