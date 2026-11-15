import { expect, test } from "bun:test"
import { tool } from "ai"
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test"
import { z } from "zod"
import { runAgent } from "../agents/lib/harness"
import { getAgent, loadPrompt } from "../agents"
import { principlesSection } from "../cli/workspace/prompt/principles"
import { toolBudgetSection } from "../cli/workspace/prompt/budget"
import { newAppWorkflowSection } from "../cli/workspace/prompt/new-app"
import { reviewSection } from "../cli/workspace/prompt/review"

test("repetition recovery disables tools and requests one evidence-based answer", async () => {
  let requests = 0
  let executions = 0
  const model = new MockLanguageModelV3({
    doStream: async (options) => {
      requests++
      if (requests === 4) {
        expect(options.toolChoice).toEqual({ type: "none" })
        expect(options.tools ?? []).toHaveLength(0)
        expect(JSON.stringify(options.prompt)).toContain("Stop repeating yourself")
      }
      const parts: any[] = requests < 4 ? [
        { type: "tool-call", toolCallId: `read-${requests}`, toolName: "read_file", input: '{"path":"fixture"}' },
      ] : [
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "The fixture contains evidence." },
        { type: "text-end", id: "answer" },
      ]
      return { stream: convertArrayToReadableStream([
        ...parts,
        { type: "finish", finishReason: { unified: requests < 4 ? "tool-calls" : "stop", raw: undefined },
          usage: { inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 3, text: 3, reasoning: 0 } } },
      ]) }
    },
  })
  const result = await runAgent(getAgent("explore")!, {
    model, budget: 10, prompt: "Inspect the fixture", system: "Inspect only.",
    tools: { read_file: tool({
      inputSchema: z.object({ path: z.string() }),
      execute: async () => {
        executions++
        return JSON.stringify({ success: true, data: { content: "evidence" } })
      },
    }) },
  })
  expect(result.error).toBeUndefined()
  expect(requests).toBe(4)
  expect(executions).toBe(3)
  expect(result.text).toBe("The fixture contains evidence.")
  expect(result.finishReason).toBe("stop")
})

test("common CLI instructions stay compact without a conflicting round target", async () => {
  const prompt = principlesSection().concat(toolBudgetSection()).join("\n")
  expect(prompt.length).toBeLessThan(3000)
  expect(prompt).not.toContain("10+ tool calls")
  expect(prompt).not.toContain("Max 5 rounds")
  expect(prompt).toContain("independent")
  expect(prompt).toContain("verification")
  const build = await loadPrompt("build")
  expect(build?.length).toBeLessThan(3500)
  expect(build).toContain("permission checks")
  expect(build).toContain("rerun affected checks")
  expect(newAppWorkflowSection().join("\n")).not.toContain("Mandatory Sequence")
  expect(newAppWorkflowSection().join("\n")).toContain("Reuse an existing app")
  expect(reviewSection().join("\n")).toContain("Match the investigation to the question")
  expect(reviewSection().join("\n")).not.toContain("Deep Dive Per Module")
})
