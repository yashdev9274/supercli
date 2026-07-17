import { z } from "zod"
import chalk from "chalk"
import boxen from "boxen"
import { theme } from "../../cli/utils/tui"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

export interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "high" | "medium" | "low"
}

let currentTodos: TodoItem[] = []

export function setTodos(todos: TodoItem[]): TodoItem[] {
  currentTodos = todos.map((t) => ({ ...t }))
  return getTodos()
}

export function getTodos(): TodoItem[] {
  return currentTodos.map((t) => ({ ...t }))
}

export function clearTodos(): void {
  currentTodos = []
}

function renderTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return chalk.hex(theme.muted)("  No todos")
  }

  const rows: string[] = []
  let inProgressIdx = -1

  for (let i = 0; i < todos.length; i++) {
    const t = todos[i]
    if (t.status === "in_progress") inProgressIdx = i

    const statusIcon =
      t.status === "completed"
        ? chalk.hex(theme.green)("✓")
        : t.status === "in_progress"
          ? chalk.hex(theme.amber)("●")
          : t.status === "cancelled"
            ? chalk.hex(theme.red)("✗")
            : chalk.hex(theme.muted)("○")

    const prioTag =
      t.priority === "high"
        ? chalk.hex(theme.red)(" high")
        : t.priority === "medium"
          ? chalk.hex(theme.amber)(" med")
          : chalk.hex(theme.muted)(" low")

    rows.push(`  ${statusIcon} ${chalk.bold(t.content)}${prioTag}`)
  }

  const completed = todos.filter((t) => t.status === "completed").length
  const total = todos.length
  const summary = chalk.hex(theme.greenDim)(
    `  ${completed}/${total} · ${inProgressIdx >= 0 ? `active: ${todos[inProgressIdx].content}` : "none in progress"}`,
  )

  return [...rows, "", summary].join("\n")
}

const todoItemSchema = z.object({
  content: z.string().describe("Brief description of the task"),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe("Current status of the task"),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Priority level of the task"),
})

const todowriteSchema = z.object({
  todos: z
    .array(todoItemSchema)
    .min(1)
    .describe(
      "The updated todo list for the session. Each item has content, status, and priority. " +
        "Only one item should be 'in_progress' at a time.",
    ),
})

export type TodowriteArgs = z.infer<typeof todowriteSchema>

export const todowriteTool = {
  description:
    "Create and maintain a structured task list for the current coding session. " +
    "Tracks progress, organizes multi-step work, and surfaces status to the user. " +
    "Use proactively when the task requires 3+ distinct steps or non-trivial work. " +
    "Only one item should have status 'in_progress' at a time. " +
    "Update the list as work progresses by calling this tool again with the updated state.",
  parameters: todowriteSchema,
  execute: async (args: TodowriteArgs) =>
    serialize(async () => {
      setTodos(args.todos)

      const box = boxen(renderTodoList(args.todos), {
        title: " Task List ",
        borderColor: theme.green,
        padding: { top: 0, bottom: 0, left: 1, right: 1 },
        margin: 0,
        borderStyle: "round",
      })

      console.log("\n" + box + "\n")

      return ok({
        todos: args.todos,
        count: args.todos.length,
        inProgress: args.todos.filter((t) => t.status === "in_progress").length,
        completed: args.todos.filter((t) => t.status === "completed").length,
      })
    }),
}
