import { z } from "zod"
import { defineTool } from "../lib/define.ts"

const reviewSchema = z.object({
  code: z
    .string()
    .optional()
    .describe("Code snippet or diff to review against the crisp ladder. If omitted, the AI should gather context from git diff or file reads."),
  context: z
    .string()
    .optional()
    .describe("Optional context about what this code does or why it was written."),
})

export type CrispReviewArgs = z.infer<typeof reviewSchema>

const _def = {
  description:
    "Review code or a diff against the Supercode Crisp simplicity ladder. " +
    "Returns structured findings tagged with [crisp:N] markers for each ladder rung. " +
    "Use this when the user asks for a crisp review of specific code or changes.",
  inputSchema: reviewSchema,
  execute: async (args: CrispReviewArgs) => {
    return JSON.stringify({
      success: true,
      hint: "Analyze the provided code against the crisp ladder in your system prompt. Tag each finding with [crisp:N].",
      code: args.code ?? "(auto-detected from workspace)",
      context: args.context,
    })
  },
}

export const crispReviewTool = defineTool(_def)
export default crispReviewTool
