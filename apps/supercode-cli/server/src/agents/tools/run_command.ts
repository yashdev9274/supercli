import { z } from "zod"
import { resolvePath } from "../../lib/workspace"
import { executeCommand } from "../../runtime/command"
import { serialize, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const runCommandSchema = z.object({
  command: z.string().min(1),
  description: z.string().optional(),
  timeout: z.number().int().min(1).max(1800000).optional().default(300000),
  cwd: z.string().optional(),
  interactive: z.boolean().optional().default(false),
  autoYes: z.boolean().optional().default(false),
})
export type RunCommandArgs = z.infer<typeof runCommandSchema>
export const runCommandTool = defineTool({
  description: "Run a noninteractive command in the workspace. Use cwd instead of cd. Inspect exitCode, signal, timedOut and success. Output previews are bounded; logPath contains additional output. Discover test/build commands from project manifests. Never claim a check passed if the command failed. Interactive handoff is not supported by this tool.",
  inputSchema: runCommandSchema,
  execute: async (input, ctx) => serialize(async () => {
    const args = runCommandSchema.parse(input)
    if (args.interactive || args.autoYes) return fail("Automatic prompt approval and interactive input are not supported. Use explicit noninteractive flags only when authorized, or ask the user to run the command.")
    const result = await executeCommand({ command: args.command, cwd: resolvePath(args.cwd ?? "."), timeout: args.timeout, signal: ctx?.signal })
    return JSON.stringify({ success: result.success, data: result, ...(result.success ? {} : { error: result.summary }) })
  }),
})
export default runCommandTool
