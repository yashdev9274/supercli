import { defineAgent } from "../../lib/define.ts"

export const agent = defineAgent({
  name: "title",
  description: "Internal agent for title.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0.5,
  instructions: "title",
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
})

export default agent
