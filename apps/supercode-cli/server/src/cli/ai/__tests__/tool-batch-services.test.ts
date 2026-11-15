import { expect, test } from "bun:test"

test("proxy and OpenRouter preserve completion IDs and ordered history across read batches", async () => {
  const child = Bun.spawn([process.execPath, "-e", `
    import { expect, mock } from "bun:test"
    mock.module("src/lib/prisma", () => ({ default: {} }))
    mock.module("src/lib/track-usage", () => ({ recordUsage: () => {} }))
    const { ServerProxyService } = await import("./src/cli/ai/server-proxy-service")
    const { OpenRouterService } = await import("./src/cli/ai/openrouter-service")
    const { z } = await import("zod")
    for (const kind of ["proxy", "openrouter"]) {
      const controller = new AbortController()
      const messages = []
      const events = []
      let release
      const fastEnded = new Promise((resolve) => { release = resolve })
      const calls = [
        { toolName: "read_file", toolCallId: "slow", args: { path: "slow" } },
        { toolName: "read_file", toolCallId: "fast", args: { path: "fast" } },
        { toolName: "write_file", toolCallId: "write", args: { path: "write" } },
        { toolName: "read_file", toolCallId: "after", args: { path: "after" } },
      ]
      const definition = {
        inputSchema: z.object({ path: z.string() }),
        execute: async ({ path }, context) => {
          expect(context.abortSignal).toBe(controller.signal)
          expect(context.toolCallId).toBe(path)
          events.push("execute:" + path)
          if (path === "slow") await fastEnded
          if (path === "write") {
            expect(events).toContain("end:slow")
            expect(events).not.toContain("execute:after")
            expect(context.messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id)).toEqual(["slow", "fast"])
          }
          return JSON.stringify({ success: true, data: { content: path } })
        },
      }
      const tools = { read_file: definition, write_file: definition }
      const onResult = ({ id }) => {
        events.push("end:" + id)
        if (id === "fast") release()
      }
      if (kind === "proxy") {
        const service = Object.create(ServerProxyService.prototype)
        service.collectedToolCalls = []
        const results = await service.executeLocalTools(tools, calls, messages, onResult, controller.signal)
        expect(results.map((result) => result.args.path)).toEqual(["slow", "fast", "write", "after"])
        expect(messages.filter((message) => message.role === "tool").map((message) => message.tool_call_id)).toEqual(["slow", "fast", "write", "after"])
        expect(service.collectedToolCalls).toEqual(calls)
        let executed = false
        await service.executeLocalTools({ read_file: { inputSchema: z.object({ path: z.number() }), execute: async () => { executed = true } } }, [calls[0]], [], () => {}, controller.signal)
        expect(executed).toBe(false)
      } else {
        const service = Object.create(OpenRouterService.prototype)
        let round = 0
        service.request = async (history) => {
          if (round++ === 0) return { content: "", finishReason: "tool-calls", usage: {}, toolCalls: calls.slice(0, 2) }
          expect(history.filter((message) => message.role === "tool").map((message) => message.tool_call_id)).toEqual(["slow", "fast"])
          return { content: "Verified fixtures.", finishReason: "stop", usage: {}, toolCalls: [] }
        }
        const result = await service.sendMessage([], undefined, tools, undefined, controller.signal, undefined, onResult)
        expect(result.content).toBe("Verified fixtures.")
      }
      expect(events.filter((event) => event.startsWith("end:"))).toEqual(kind === "proxy" ? ["end:fast", "end:slow", "end:write", "end:after"] : ["end:fast", "end:slow"])
    }
  `], {
    cwd: new URL("../../../..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ exitCode, stdout, stderr }).toEqual({ exitCode: 0, stdout: "", stderr: "" })
})
