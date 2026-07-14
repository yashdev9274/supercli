import * as readline from "node:readline"
import { isCancel, confirm } from "@clack/prompts"
import chalk from "chalk"
import { theme, heavyDivider } from "src/cli/utils/tui.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"
import { getCliConfig, saveCliConfig } from "src/lib/cli-config.ts"

interface ModelEntry {
  value: string
  label: string
  provider: ModelProvider
  cost: string
  desc: string
}

const MODELS: ModelEntry[] = [
  { value: "glm-5.2", label: "GLM 5.2", provider: "concentrateai", cost: "0.5x", desc: "Latest GLM" },
  { value: "kimi-k2-6", label: "Kimi K2.6", provider: "concentrateai", cost: "0.8x", desc: "Long context" },
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "concentrateai", cost: "1.0x", desc: "Fast & capable" },
  { value: "minimax-m3", label: "MiniMax M3", provider: "concentrateai", cost: "0.5x", desc: "Fast & smart" },
  // { value: "anthropic/claude-opus-4-8", label: "Opus 4.8", provider: "concentrateai", cost: "40x", desc: "Deep reasoning" },
  // { value: "anthropic/claude-opus-4-8", label: "Opus 4.8", provider: "mergedev", cost: "40x", desc: "Via Merge Dev" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", cost: "2.0x", desc: "Smart & fast" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", cost: "4.0x", desc: "Deep reasoning" },
  { value: "minimaxai/minimax-m3", label: "MiniMax M3", provider: "nvidia", cost: "0.5x", desc: "Via NVIDIA NIM" },
  { value: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "nvidia", cost: "1.0x", desc: "Via NVIDIA NIM" },
  { value: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "nvidia", cost: "1.2x", desc: "Open weights" },
  { value: "openai/gpt-oss-120b:free", label: "GPT OSS 120B", provider: "openrouter", cost: "free", desc: "OpenAI open-weight" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "openrouter", cost: "1.2x", desc: "Via OpenRouter" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", provider: "openrouter", cost: "3.0x", desc: "Via OpenRouter" },
  { value: "z-ai/glm-5.1", label: "GLM 5.1", provider: "openrouter", cost: "1.0x", desc: "Via OpenRouter" },
  { value: "moonshotai/kimi-k2.6", label: "Kimi K2.6", provider: "openrouter", cost: "1.5x", desc: "Via OpenRouter" },
]

export class ModelPicker {
  items: ModelEntry[] = MODELS
  selected = 0
  overlayLines = 0

  render(
    width: number,
    currentProvider: string,
    currentModel: string,
  ): string[] {
    const lines: string[] = []
    const total = this.items.length
    if (total === 0) return lines

    const maxVisible = 10
    const half = Math.floor(maxVisible / 2)

    let start = Math.max(0, this.selected - half)
    let end = Math.min(total, start + maxVisible)
    if (end - start < maxVisible && start > 0) {
      start = Math.max(0, end - maxVisible)
    }

    const hasPrev = start > 0
    const hasNext = end < total

    const divider = heavyDivider()
    lines.push(divider)
    lines.push(
      ` ${chalk.hex(theme.greenGlow)("Switch Model")} ${chalk.hex(theme.muted)("· Multipliers represent cost in Standard Tokens")}`,
    )
    lines.push(divider)

    if (hasPrev) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▲ ${start} more`)}`)
    }

    for (let i = start; i < end; i++) {
      const m = this.items[i]!
      const isCurrent =
        m.provider === currentProvider && m.value === currentModel
      const isSelected = i === this.selected

      const providerTag =
        m.provider === "concentrateai"
          ? ""
          : ` ${chalk.hex(theme.greenDim)(m.provider)}`

      const prefix = isSelected ? chalk.hex(theme.amber)("▸") : " "
      const name = chalk.hex(
        isCurrent ? theme.green : theme.greenGlow,
      )(m.label.padEnd(22))
      const cost = chalk.hex(
        m.cost === "free" ? theme.greenGlow : theme.muted,
      )(m.cost.padEnd(6))
      const desc = chalk.hex(theme.muted)(m.desc.padEnd(20))
      const marker = isCurrent
        ? ` ${chalk.bgHex(theme.amber).hex(theme.black).bold(" current ")}`
        : ""
      const freeTag =
        !isCurrent && (m.cost === "free" || m.provider === "concentrateai" || m.provider === "mergedev")
          ? ` ${chalk.bgHex(theme.green).hex(theme.black).bold(" FREE ")}`
          : ""

      const label = `${prefix} ${name} ${cost}${desc}${providerTag}${marker}${freeTag}`

      if (isSelected) {
        const bg = chalk.bgHex(theme.greenDeep)
        lines.push(bg(label.padEnd(width)))
      } else {
        lines.push(label)
      }
    }

    if (hasNext) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▼ ${total - end} more`)}`)
    }

    lines.push(divider)
    this.overlayLines = lines.length
    return lines
  }

  selectNext(): void {
    if (this.items.length === 0) return
    this.selected = (this.selected + 1) % this.items.length
  }

  selectPrev(): void {
    if (this.items.length === 0) return
    this.selected =
      (this.selected - 1 + this.items.length) % this.items.length
  }

  getSelected(): ModelEntry {
    return this.items[this.selected]!
  }
}

/**
 * Minimal raw-stdin key reader. Collects a buffer on each `data` event.
 * If the buffer starts with ESC, it waits up to 80ms for more bytes so that
 * escape sequences (arrows) are disambiguated from a lone Escape press.
 */
function readRawKey(): Promise<"up" | "down" | "enter" | "escape"> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0)

    const handler = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const b = Array.from(buf)
      // Enter (0x0d or 0x0a)
      if (b.length === 1 && (b[0] === 0x0d || b[0] === 0x0a)) {
        cleanup()
        resolve("enter")
        return
      }
      // Escape sequence: ESC [ A/B (up/down) — exactly 3 bytes
      if (b[0] === 0x1b && b.length >= 2) {
        if (b[1] === 0x5b && b.length >= 3) {
          if (b[2] === 0x41) { cleanup(); resolve("up"); return }
          if (b[2] === 0x42) { cleanup(); resolve("down"); return }
          // Unknown escape sequence — treat as escape
          cleanup()
          resolve("escape")
          return
        }
        // ESC followed by something other than '[' — treat as escape
        cleanup()
        resolve("escape")
        return
      }
      // Lone ESC: wait briefly for more bytes
      if (b.length === 1 && b[0] === 0x1b) {
        // Still waiting for more bytes via the data listener below
        return
      }
      // Anything else (including j/k vim keys) — ignore
      cleanup()
      // Don't resolve; keep reading
      process.stdin.once("data", handler)
    }

    const timeout = setTimeout(() => {
      // If only ESC byte arrived within the window → cancel
      if (buf.length === 1 && buf[0] === 0x1b) {
        cleanup()
        resolve("escape")
      } else {
        // Just keep waiting
        process.stdin.once("data", handler)
      }
    }, 80)

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener("data", handler)
    }

    process.stdin.once("data", handler)
  })
}

export async function pickModel(): Promise<{ provider: ModelProvider; model?: string }> {
  const stored = await getCliConfig()
  const currentProvider = stored?.provider || "concentrateai"
  const currentModel = stored?.model || "glm-5.1"

  const picker = new ModelPicker()
  const cols = process.stdout.columns ?? 80

  const draw = () => {
    const lines = picker.render(cols, currentProvider, currentModel)
    for (const line of lines) {
      process.stdout.write(line + "\n")
    }
  }

  const clear = (n: number) => {
    for (let i = 0; i < n; i++) {
      readline.moveCursor(process.stdout, 0, -1)
      readline.cursorTo(process.stdout, 0)
      readline.clearLine(process.stdout, 0)
    }
  }

  // Initial draw
  process.stdout.write("\n")
  draw()

  // Enter raw mode
  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  let selected: ModelEntry | null = null

  while (true) {
    const key = await readRawKey()
    if (key === "up") {
      picker.selectPrev()
      clear(picker.overlayLines)
      draw()
    } else if (key === "down") {
      picker.selectNext()
      clear(picker.overlayLines)
      draw()
    } else if (key === "enter") {
      selected = picker.getSelected()
      break
    } else if (key === "escape") {
      break
    }
  }

  // Restore terminal
  if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)

  // Clear the picker overlay
  clear(picker.overlayLines + 1) // +1 for the leading \n

  if (!selected) {
    return { provider: currentProvider as ModelProvider, model: currentModel }
  }

  // Ask about setting as default
  process.stdout.write("\n")
  const setAsDefault = await confirm({
    message: chalk.hex(theme.greenMute)("Set as default for new sessions?"),
    initialValue: false,
  })

  if (!isCancel(setAsDefault) && setAsDefault) {
    await saveCliConfig({
      provider: selected.provider,
      model: selected.value,
    })
    const label = formatModelChange(selected.provider, selected.value)
    process.stdout.write(
      `  ${chalk.hex(theme.green)("◆")} saved default: ${chalk.hex(theme.greenGlow)(label)}\n\n`,
    )
  }

  return { provider: selected.provider, model: selected.value }
}

export function formatModelChange(p: ModelProvider, m?: string): string {
  const label = p === "concentrateai" ? "ConcentrateAI" :
    p === "google" ? "Gemini" :
    p === "nvidia" ? "NVIDIA" : p === "minimax" ? "MiniMax" :
    p === "mergedev" ? "Merge Dev" : "OpenRouter"
  return `${label}${m ? ` · ${m}` : ""}`
}
