import { z } from "zod"

const codeExecSchema = z.object({
  code: z.string().describe("JavaScript/TypeScript code to execute"),
  timeout: z.number().optional().default(5000).describe("Execution timeout in milliseconds"),
})

export type CodeExecArgs = z.infer<typeof codeExecSchema>

export const codeExecTool = {
  description: "Execute JavaScript/TypeScript code in a sandboxed environment. Use this for calculations, data transformation, or testing small code snippets.",
  parameters: codeExecSchema,
  execute: async ({ code, timeout }: CodeExecArgs) => {
    const vm = await import("node:vm")
    const timers = await import("node:timers")

    try {
      const context: Record<string, unknown> = {
        console: {
          log: (...args: unknown[]) => { capturedLog.push(args.map(String).join(" ")) },
          warn: (...args: unknown[]) => { capturedLog.push("warn: " + args.map(String).join(" ")) },
          error: (...args: unknown[]) => { capturedLog.push("error: " + args.map(String).join(" ")) },
        },
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval,
        clearInterval: timers.clearInterval,
        Math,
        JSON,
        Date,
        RegExp,
        String,
        Number,
        Boolean,
        Array,
        Object,
        Map,
        Set,
        Promise,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
      }

      const capturedLog: string[] = []
      const sandbox = vm.createContext(context)
      const script = new vm.Script(code)
      const result = script.runInContext(sandbox, { timeout })

      const output = [
        capturedLog.length > 0 ? capturedLog.join("\n") : null,
        result !== undefined ? String(result) : null,
      ].filter(Boolean).join("\n")

      return output || "(no output)"
    } catch (error) {
      return `Execution error: ${error instanceof Error ? error.message : String(error)}`
    }
  },
}
