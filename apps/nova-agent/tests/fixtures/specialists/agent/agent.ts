import { mockModel } from "eve/evals"
import { createNovaAgent } from "../../../../lib/agent"

export default createNovaAgent(mockModel(({ toolResults }) => toolResults.length < 3
  ? { toolCalls: [{ name: "consult_specialist", input: { role: ["explorer", "implementer", "verifier"][toolResults.length], message: "Inspect file.txt and return your role-specific evidence only" } }] }
  : "Specialists reviewed independent assignments; parent retains all write permissions"))
