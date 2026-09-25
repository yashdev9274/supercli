import { defineAgent } from "../../lib/define.ts"

export const agent = defineAgent({
  name: "compaction",
  description: "Internal agent for compaction.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0,
  instructions: "compaction",
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
})

export default agent
