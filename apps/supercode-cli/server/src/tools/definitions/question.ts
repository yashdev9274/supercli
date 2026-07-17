import { z } from "zod"
import chalk from "chalk"
import boxen from "boxen"
import * as readline from "readline"
import { theme } from "../../cli/utils/tui"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const questionOptionSchema = z.object({
  label: z.string().describe("Display text (1-5 words, concise)"),
  description: z.string().optional().describe("Explanation of the choice"),
})

const questionItemSchema = z.object({
  question: z.string().describe("Complete question to ask the user"),
  header: z.string().optional().describe("Very short label (max 30 chars) for the question category"),
  options: z
    .array(questionOptionSchema)
    .optional()
    .describe("Available choices for the user to select from"),
  multiple: z
    .boolean()
    .optional()
    .default(false)
    .describe("Allow selecting multiple choices. When enabled, user can pick several options."),
})

const questionSchema = z.object({
  questions: z
    .array(questionItemSchema)
    .min(1)
    .max(5)
    .describe("Questions to ask the user"),
})

export type QuestionArgs = z.infer<typeof questionSchema>

function styledLabel(num: number, label: string): string {
  const numTag = chalk.hex(theme.green)(`    ${num}.`)
  return `${numTag} ${chalk.bold(label)}`
}

function styledDesc(desc: string): string {
  return chalk.hex(theme.muted)(`       ${desc}`)
}

function askOne(item: z.infer<typeof questionItemSchema>): Promise<string | string[]> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw

    if (stdin.isTTY) {
      stdin.setRawMode(false)
    }

    console.log()

    const header = item.header
      ? chalk.hex(theme.green)(` ${item.header} `)
      : ""

    const boxContent = item.header
      ? chalk.bold(item.question)
      : chalk.bold(item.question)

    console.log(
      boxen(boxContent, {
        title: item.header || undefined,
        titleAlignment: "left",
        borderColor: theme.green,
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        margin: 0,
        borderStyle: "round",
      }),
    )

    const rl = readline.createInterface({ input: stdin, output: process.stdout, terminal: true })

    if (!item.options || item.options.length === 0) {
      rl.question(chalk.hex(theme.green)("  Your answer: "), (answer) => {
        rl.close()
        if (stdin.isTTY && wasRaw) stdin.setRawMode(true)
        resolve(answer.trim())
      })
      return
    }

    console.log()
    item.options.forEach((opt, i) => {
      console.log(styledLabel(i + 1, opt.label))
      if (opt.description) {
        console.log(styledDesc(opt.description))
      }
    })
    console.log()

    const promptText = item.multiple
      ? chalk.hex(theme.green)("  Select options (comma-separated numbers, e.g. 1,3): ")
      : chalk.hex(theme.green)("  Your choice (number): ")

    rl.question(promptText, (raw) => {
      rl.close()
      if (stdin.isTTY && wasRaw) stdin.setRawMode(true)

      const trimmed = raw.trim()
      if (!trimmed) {
        resolve([])
        return
      }

      if (item.multiple) {
        const indices = trimmed
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n) && n >= 1 && n <= item.options!.length)
        if (indices.length === 0) {
          resolve([])
          return
        }
        resolve(indices.map((i) => item.options![i - 1].label))
      } else {
        const num = parseInt(trimmed, 10)
        if (isNaN(num) || num < 1 || num > item.options.length) {
          resolve("(invalid selection)")
          return
        }
        resolve(item.options[num - 1].label)
      }
    })
  })
}

export const questionTool = {
  description:
    "Ask the user questions to gather context, clarify requirements, " +
    "or get decisions on implementation choices. Renders numbered MCQ-style " +
    "options for structured feedback. Supports single-choice, multi-select, " +
    "and free-form answers. Use before complex tasks to ensure you understand " +
    "what the user needs. When asking for preferences or decisions, provide " +
    "options with clear labels and optional descriptions.",
  parameters: questionSchema,
  execute: async (args: QuestionArgs) =>
    serialize(async () => {
      const answers: Array<{ question: string; answer: string | string[] }> = []

      for (const item of args.questions) {
        const answer = await askOne(item)
        answers.push({ question: item.question, answer })
      }

      return ok({ answers })
    }),
}
