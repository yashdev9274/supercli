import { describe, expect, test } from "bun:test"
import { createNeon, getNeonModelRoute } from "@neon/ai-sdk-provider"
import { getNeonConfig, normalizeNeonBaseURL } from "./neon.config"
import { neonMessages, neonTools } from "../runtime/stream/neon-stream"
import { NEON_MODELS } from "../../../../web/modules/nova-web/models"

// All credentials below are synthetic fixtures; no live requests are made.
describe("Neon gateway", () => {
  test("requires both settings and normalizes a bare HTTPS URL", () => {
    expect(normalizeNeonBaseURL(" https://branch.example/ ")).toBe("https://branch.example")
    expect(() => getNeonConfig({})).toThrow("NEON_AI_GATEWAY_BASE_URL")
    expect(() => getNeonConfig({ NEON_AI_GATEWAY_BASE_URL: "https://branch.example" })).toThrow("NEON_AI_GATEWAY_TOKEN")
    for (const url of ["", "bad", "http://branch.example", "https://user:pass@branch.example", "https://branch.example/v1", "https://branch.example/?token=x", "https://branch.example/#x"]) {
      expect(() => normalizeNeonBaseURL(url)).toThrow("bare HTTPS")
    }
  })

  test("routes all picker models to native SDK endpoints", () => {
    const provider = createNeon({ baseURL: "https://branch.example", apiKey: "synthetic-test-token" })
    for (const entry of NEON_MODELS) {
      const model = provider(entry.id)
      expect(model.modelId).toBe(entry.id)
    }
    expect(getNeonModelRoute("claude-sonnet-4-6")).toBe("anthropic")
    expect(getNeonModelRoute("gpt-5-3-codex")).toBe("openai")
    expect(getNeonModelRoute("kimi-k3")).toBe("mlflow")
  })

  test("preserves tool IDs, names, arguments and results across turns", () => {
    const messages = neonMessages([
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", function: { name: "read_file", arguments: '{"path":"file.ts"}' } }] },
      { role: "tool", tool_call_id: "call_1", content: "file contents" },
    ])
    expect(messages[0]).toEqual({ role: "assistant", content: [{ type: "tool-call", toolCallId: "call_1", toolName: "read_file", input: { path: "file.ts" } }] })
    expect(messages[1]).toEqual({ role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", toolName: "read_file", output: { type: "text", value: "file contents" } }] })
    expect(neonTools({ read_file: { parameters: { type: "object", properties: {} } } })?.read_file?.inputSchema).toBeDefined()
  })
})
