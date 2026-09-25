import { z } from "zod"
import { defineTool } from "../lib/define.ts"

const auditSchema = z.object({
  path: z
    .string()
    .optional()
    .describe("Path to a specific file or directory to audit. If omitted, audit the whole workspace."),
  focus: z
    .enum(["all", "dependencies", "abstractions", "complexity", "boilerplate"])
    .optional()
    .default("all")
    .describe("Which aspect of over-engineering to focus on."),
})

export type CrispAuditArgs = z.infer<typeof auditSchema>

const _def = {
  description:
    "Scan the workspace (or a specific path) for over-engineering patterns and rank findings by severity. " +
    "Checks for unnecessary abstractions, overuse of dependencies, premature optimization, " +
    "and other violations of the Supercode Crisp simplicity ladder. Returns ranked findings.",
  inputSchema: auditSchema,
  execute: async (args: CrispAuditArgs) => {
    return JSON.stringify({
      success: true,
      hint: "Walk the workspace tree and key files. Apply the full crisp ladder and tag every finding with [crisp:N]. Rank by severity (1-7, where 1=YAGNI is most important).",
      path: args.path ?? "(workspace root)",
      focus: args.focus,
    })
  },
}

export const crispAuditTool = defineTool(_def)
export default crispAuditTool
