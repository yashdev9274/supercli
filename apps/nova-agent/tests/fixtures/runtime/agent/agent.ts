import { mockModel } from "eve/evals"

import { createNovaAgent } from "../../../../lib/agent"

export default createNovaAgent(mockModel(({ toolResults }) => toolResults.length === 0
  ? { toolCalls: [{ name: "runtime_info", input: {} }] }
  : `Runtime verified: ${JSON.stringify(toolResults[0].output)}`))
