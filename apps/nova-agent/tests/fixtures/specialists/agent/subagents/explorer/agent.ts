import { mockModel } from "eve/evals"
import { specialistAgent } from "../../../../../../lib/specialist"

export default specialistAgent("explorer", () => ({
  model: mockModel(({ tools, messages, toolResults }) => {
    if (messages.some((message) => message.text.includes("PARENT_PRIVATE_CONTEXT"))) throw new Error("Parent context leaked")
    if (tools.some((tool) => !["read_file", "search_files", "read_instructions"].includes(tool.name))) throw new Error("Unexpected specialist capability")
    return !toolResults.length
      ? { toolCalls: [{ name: "read_file", input: { path: "file.txt" } }] }
      : "explorer: inspected file.txt at version v1; proposal/review only, no changes"
  }),
  modelContextWindowTokens: 8192,
}))
