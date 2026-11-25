import { mockModel } from "eve/evals"
import { createNovaAgent } from "../../../../lib/agent"

export default createNovaAgent(mockModel(({ toolResults }) => {
  if (!toolResults.length) return { toolCalls: [{ name: "write_file", input: { path: "file.txt", content: "edited", expectedVersion: "v1" } }] }
  if (toolResults.some((result) => result.isError)) return "Repository operation failed; task incomplete"
  if (!toolResults.some((result) => result.name === "repository_verify")) return { toolCalls: [{ name: "repository_verify", input: {} }] }
  if (!toolResults.some((result) => result.name === "repository_finish")) return { toolCalls: [{ name: "repository_finish", input: {} }] }
  return "Verified repository fixture and exported patch"
}))
