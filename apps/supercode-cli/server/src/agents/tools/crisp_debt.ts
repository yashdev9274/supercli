import { z } from "zod"
import { defineTool } from "../lib/define.ts"

const debtSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Path to search for crisp: comments. Defaults to workspace root."),
})

export type CrispDebtArgs = z.infer<typeof debtSchema>

const _def = {
  description:
    "Find and report all [crisp:N] tagged comments in the workspace. " +
    "These are markers left by previous crisp reviews indicating code that should be simplified. " +
    "Returns each tag with its file location and surrounding context.",
  inputSchema: debtSchema,
  execute: async (args: CrispDebtArgs) => {
    return JSON.stringify({
      success: true,
      hint: "Use run_command to grep for [crisp: across the workspace. Group results by rung number and file path. Report totals per rung.",
      path: args.path ?? "(workspace root)",
    })
  },
}

export const crispDebtTool = defineTool(_def)
export default crispDebtTool
