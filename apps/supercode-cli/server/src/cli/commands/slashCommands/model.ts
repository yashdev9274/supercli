import * as readline from "node:readline"
import { isCancel, confirm, text, password } from "@clack/prompts"
import chalk from "chalk"
import { theme, heavyDivider, CARET } from "src/cli/utils/tui.ts"
import { type ModelProvider, providerMeta } from "src/cli/ai/provider.ts"
import { getCliConfig, saveCliConfig, saveProviderApiKey, getByokSessionKey } from "src/lib/cli-config.ts"

interface ModelEntry {
  value: string
  label: string
  provider: ModelProvider
  cost: string
  desc: string
}

const SECTION_CLOUD = "__section_cloud__"
const SECTION_BYOK = "__section_byok__"
const SECTION_CONCENTRATEAI = "__section_concentrateai__"
const SECTION_MERGEDEV = "__section_mergedev__"
const SECTION_GOOGLE = "__section_google__"
const SECTION_MINIMAX = "__section_minimax__"
const SECTION_NVIDIA = "__section_nvidia__"
const SECTION_OPENROUTER = "__section_openrouter__"
const SECTION_ORCAROUTER = "__section_orcarouter__"

export const ALL_SECTIONS = new Set([
  SECTION_CLOUD, SECTION_BYOK,
  SECTION_CONCENTRATEAI, SECTION_MERGEDEV,
  SECTION_GOOGLE, SECTION_MINIMAX,
  SECTION_NVIDIA, SECTION_OPENROUTER,
  SECTION_ORCAROUTER,
])

const SECTION_LABELS: Record<string, string> = {
  [SECTION_CLOUD]: "Supercode Cloud",
  [SECTION_BYOK]: "Bring Your Own Key",
  [SECTION_CONCENTRATEAI]: "ConcentrateAI",
  [SECTION_MERGEDEV]: "Merge Dev Gateway",
  [SECTION_GOOGLE]: "Google Gemini",
  [SECTION_MINIMAX]: "MiniMax",
  [SECTION_NVIDIA]: "NVIDIA NIM",
  [SECTION_OPENROUTER]: "OpenRouter",
  [SECTION_ORCAROUTER]: "OrcaRouter",
}

const isMainSection = (v: string) => v === SECTION_CLOUD || v === SECTION_BYOK

// Models available through the Supercode cloud proxy (no API key needed)
export const CLOUD_MODELS: ModelEntry[] = [
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "supercode", cost: "free", desc: "Fast & capable" },
  { value: "glm-5.2", label: "GLM 5.2", provider: "supercode", cost: "free", desc: "Latest GLM" },
  { value: "glm-5.1", label: "GLM 5.1", provider: "supercode", cost: "free", desc: "Stable & reliable" },
  { value: "kimi-k2-6", label: "Kimi K2.6", provider: "supercode", cost: "free", desc: "Long context" },
  { value: "minimax-m3", label: "MiniMax M3", provider: "supercode", cost: "free", desc: "Fast & smart" },
]

// Models available when you bring your own API key (BYOK)
export const BYOK_MODELS: ModelEntry[] = [
  // ── ConcentrateAI (BYOK) ──────────────────────────────────────
  { value: SECTION_CONCENTRATEAI, label: "ConcentrateAI", provider: "concentrateai", cost: "", desc: "" },
  { value: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", provider: "concentrateai", cost: "", desc: "Deep reasoning" },
  { value: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "concentrateai", cost: "", desc: "Top-tier reasoning" },
  { value: "anthropic/claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "concentrateai", cost: "", desc: "Latest sonnet" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "concentrateai", cost: "", desc: "Balanced" },
  { value: "anthropic/claude-3-5-haiku", label: "Claude 3.5 Haiku", provider: "concentrateai", cost: "", desc: "Fast & cheap" },
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "concentrateai", cost: "", desc: "OpenAI flagship" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "concentrateai", cost: "", desc: "Cheap & fast" },
  { value: "openai/gpt-4-1", label: "GPT-4.1", provider: "concentrateai", cost: "", desc: "Latest GPT" },
  { value: "openai/o3-mini", label: "o3-mini", provider: "concentrateai", cost: "", desc: "Reasoning mini" },
  { value: "openai/o4-mini", label: "o4-mini", provider: "concentrateai", cost: "", desc: "Reasoning v4 mini" },
  { value: "x-ai/grok-4-5", label: "Grok 4.5", provider: "concentrateai", cost: "", desc: "xAI latest" },
  { value: "x-ai/grok-3", label: "Grok 3", provider: "concentrateai", cost: "", desc: "xAI flagship" },
  { value: "x-ai/grok-3-mini", label: "Grok 3 Mini", provider: "concentrateai", cost: "", desc: "Compact Grok" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "concentrateai", cost: "", desc: "Fast & capable" },
  { value: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "concentrateai", cost: "", desc: "DeepSeek flagship" },
  { value: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "concentrateai", cost: "", desc: "Reasoning model" },
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "concentrateai", cost: "", desc: "Latest Llama" },
  { value: "z-ai/glm-5-2", label: "GLM 5.2", provider: "concentrateai", cost: "", desc: "Latest GLM" },
  { value: "kimi-k3", label: "Kimi K3", provider: "concentrateai", cost: "", desc: "Moonshot latest" },
  { value: "kimi-k2-6", label: "Kimi K2.6", provider: "concentrateai", cost: "", desc: "Long context" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", provider: "concentrateai", cost: "", desc: "Fast & smart" },

  // ── Merge Dev Gateway ────────────────────────────────────────
  { value: SECTION_MERGEDEV, label: "Merge Dev Gateway", provider: "mergedev", cost: "", desc: "" },
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "mergedev", cost: "12x", desc: "Latest sonnet" },
  { value: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", provider: "mergedev", cost: "40x", desc: "Deep reasoning" },
  { value: "gpt-4o", label: "GPT-4o", provider: "mergedev", cost: "4x", desc: "OpenAI flagship" },
  { value: "xai/grok-4.3", label: "Grok 4.3", provider: "mergedev", cost: "10x", desc: "Via Merge Dev" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "mergedev", cost: "2x", desc: "Via Merge Dev" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "mergedev", cost: "4x", desc: "Via Merge Dev" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "mergedev", cost: "1.2x", desc: "Via Merge Dev" },
  { value: "moonshot/kimi-k3", label: "Kimi K3", provider: "mergedev", cost: "3x", desc: "Via Merge Dev" },
  // ConcentrateAI-like models through Merge Dev
  { value: "anthropic/claude-opus-4-20250514", label: "Claude Opus 4", provider: "mergedev", cost: "30x", desc: "Top-tier reasoning" },
  { value: "anthropic/claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5", provider: "mergedev", cost: "15x", desc: "Latest sonnet" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", provider: "mergedev", cost: "1x", desc: "Cheap & fast" },
  { value: "gpt-4.1", label: "GPT-4.1", provider: "mergedev", cost: "3x", desc: "Latest GPT" },
  { value: "o3-mini", label: "o3-mini", provider: "mergedev", cost: "3x", desc: "Reasoning mini" },
  { value: "o4-mini", label: "o4-mini", provider: "mergedev", cost: "3x", desc: "Reasoning v4 mini" },
  { value: "xai/grok-4.5", label: "Grok 4.5", provider: "mergedev", cost: "15x", desc: "xAI latest" },
  { value: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "mergedev", cost: "1.5x", desc: "DeepSeek flagship" },
  { value: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "mergedev", cost: "4x", desc: "Reasoning model" },
  { value: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick", provider: "mergedev", cost: "2x", desc: "Latest Llama" },
  { value: "moonshot/kimi-k2.6", label: "Kimi K2.6", provider: "mergedev", cost: "3x", desc: "Long context" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", provider: "mergedev", cost: "1.5x", desc: "Fast & smart" },

  // ── Google Gemini ─────────────────────────────────────────────
  { value: SECTION_GOOGLE, label: "Google Gemini", provider: "google", cost: "", desc: "" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", cost: "2.0x", desc: "Smart & fast" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", cost: "4.0x", desc: "Deep reasoning" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "google", cost: "1.5x", desc: "Previous gen" },
  { value: "gemini-2.5-flash-preview", label: "Gemini 2.5 Flash Preview", provider: "google", cost: "2.0x", desc: "Latest preview" },
  { value: "gemini-2.5-pro-preview", label: "Gemini 2.5 Pro Preview", provider: "google", cost: "4.0x", desc: "Max preview" },
  { value: "learnlm-1.5-pro", label: "LearnLM 1.5 Pro", provider: "google", cost: "1.0x", desc: "Teaching optimized" },

  // ── MiniMax ──────────────────────────────────────────────────
  { value: SECTION_MINIMAX, label: "MiniMax", provider: "minimax", cost: "", desc: "" },
  { value: "MiniMax-M2", label: "MiniMax M2", provider: "minimax", cost: "0.8x", desc: "MiniMax flagship" },
  { value: "MiniMax-M3", label: "MiniMax M3", provider: "minimax", cost: "0.5x", desc: "Fast & smart" },

  // ── NVIDIA NIM ───────────────────────────────────────────────
  { value: SECTION_NVIDIA, label: "NVIDIA NIM", provider: "nvidia", cost: "", desc: "" },
  { value: "meta/llama-3.1-405b-instruct", label: "Llama 3.1 405B", provider: "nvidia", cost: "2.0x", desc: "Via NVIDIA NIM" },
  { value: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "nvidia", cost: "1.2x", desc: "Open weights" },
  { value: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B", provider: "nvidia", cost: "1.0x", desc: "Via NVIDIA NIM" },
  { value: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", provider: "nvidia", cost: "0.5x", desc: "Via NVIDIA NIM" },
  { value: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B", provider: "nvidia", cost: "1.2x", desc: "RLHF optimized" },
  { value: "nvidia/llama-3.1-nemotron-ultra-253b", label: "Nemotron Ultra 253B", provider: "nvidia", cost: "2.5x", desc: "Biggest NIM" },
  { value: "mistralai/mistral-7b-instruct-v0.3", label: "Mistral 7B", provider: "nvidia", cost: "0.5x", desc: "Via NVIDIA NIM" },
  { value: "qwen/qwen2.5-72b-instruct", label: "Qwen 2.5 72B", provider: "nvidia", cost: "1.2x", desc: "Via NVIDIA NIM" },
  { value: "minimaxai/minimax-m3", label: "MiniMax M3", provider: "nvidia", cost: "0.5x", desc: "Via NVIDIA NIM" },
  { value: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "nvidia", cost: "1.0x", desc: "Via NVIDIA NIM" },

  // ── OpenRouter ──────────────────────────────────────────────
  { value: SECTION_OPENROUTER, label: "OpenRouter", provider: "openrouter", cost: "", desc: "" },
  { value: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8", provider: "openrouter", cost: "40x", desc: "Deep reasoning" },
  { value: "anthropic/claude-opus-4", label: "Claude Opus 4", provider: "openrouter", cost: "30x", desc: "Top-tier reasoning" },
  { value: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", provider: "openrouter", cost: "12x", desc: "Balanced" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", provider: "openrouter", cost: "10x", desc: "Latest sonnet" },
  { value: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", provider: "openrouter", cost: "3x", desc: "Fast & cheap" },
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "openrouter", cost: "4x", desc: "OpenAI flagship" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "openrouter", cost: "0.5x", desc: "Cheap & fast" },
  { value: "openai/gpt-4.1", label: "GPT-4.1", provider: "openrouter", cost: "3x", desc: "Latest GPT" },
  { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openrouter", cost: "1x", desc: "Compact GPT" },
  { value: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openrouter", cost: "0.3x", desc: "Tiny & fast" },
  { value: "openai/o3-mini", label: "o3-mini", provider: "openrouter", cost: "3x", desc: "Reasoning mini" },
  { value: "openai/o4-mini", label: "o4-mini", provider: "openrouter", cost: "3x", desc: "Reasoning v4 mini" },
  { value: "openai/gpt-oss-120b:free", label: "GPT OSS 120B", provider: "openrouter", cost: "free", desc: "Open-weight free" },
  { value: "x-ai/grok-3", label: "Grok 3", provider: "openrouter", cost: "10x", desc: "xAI flagship" },
  { value: "x-ai/grok-3-mini", label: "Grok 3 Mini", provider: "openrouter", cost: "5x", desc: "Compact Grok" },
  { value: "x-ai/grok-3-mini-fast", label: "Grok 3 Mini Fast", provider: "openrouter", cost: "5x", desc: "Fast Grok" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "openrouter", cost: "1.2x", desc: "Via OpenRouter" },
  { value: "deepseek/deepseek-v3", label: "DeepSeek V3", provider: "openrouter", cost: "1.5x", desc: "DeepSeek flagship" },
  { value: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "openrouter", cost: "4x", desc: "Reasoning model" },
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "openrouter", cost: "2x", desc: "Latest Llama" },
  { value: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "openrouter", cost: "1x", desc: "Lightweight Llama" },
  { value: "meta-llama/llama-3.3-70b", label: "Llama 3.3 70B", provider: "openrouter", cost: "1.2x", desc: "Open weights" },
  { value: "mistral/mistral-large", label: "Mistral Large", provider: "openrouter", cost: "4x", desc: "Mistral flagship" },
  { value: "mistral/mistral-small", label: "Mistral Small", provider: "openrouter", cost: "0.5x", desc: "Compact Mistral" },
  { value: "mistral/codestral-2501", label: "Codestral", provider: "openrouter", cost: "2x", desc: "Code specialist" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "openrouter", cost: "4x", desc: "Via OpenRouter" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "openrouter", cost: "2x", desc: "Via OpenRouter" },
  { value: "qwen/qwen-2.5-72b", label: "Qwen 2.5 72B", provider: "openrouter", cost: "1.2x", desc: "Alibaba flagship" },
  { value: "qwen/qwen-2.5-coder-32b", label: "Qwen 2.5 Coder 32B", provider: "openrouter", cost: "1x", desc: "Coding specialist" },
  { value: "qwen/qwq-32b", label: "QWQ 32B", provider: "openrouter", cost: "1.2x", desc: "Reasoning model" },
  { value: "cohere/command-r-plus", label: "Command R+", provider: "openrouter", cost: "3x", desc: "Cohere flagship" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", provider: "openrouter", cost: "3.0x", desc: "Via OpenRouter" },
  { value: "z-ai/glm-5.1", label: "GLM 5.1", provider: "openrouter", cost: "1.0x", desc: "Via OpenRouter" },
  { value: "moonshotai/kimi-k2.6", label: "Kimi K2.6", provider: "openrouter", cost: "1.5x", desc: "Via OpenRouter" },

  // ── OrcaRouter ──────────────────────────────────────────────
  { value: SECTION_ORCAROUTER, label: "OrcaRouter", provider: "orcarouter", cost: "", desc: "" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini", provider: "orcarouter", cost: "0.5x", desc: "Cheap & fast" },
  { value: "openai/gpt-4o", label: "GPT-4o", provider: "orcarouter", cost: "4x", desc: "OpenAI flagship" },
  { value: "openai/gpt-4.1", label: "GPT-4.1", provider: "orcarouter", cost: "3x", desc: "Latest GPT" },
  { value: "openai/o3-mini", label: "o3-mini", provider: "orcarouter", cost: "3x", desc: "Reasoning mini" },
  { value: "openai/o4-mini", label: "o4-mini", provider: "orcarouter", cost: "3x", desc: "Reasoning v4 mini" },
  { value: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "orcarouter", cost: "12x", desc: "Latest sonnet" },
  { value: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", provider: "orcarouter", cost: "40x", desc: "Deep reasoning" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "orcarouter", cost: "2x", desc: "Smart & fast" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "orcarouter", cost: "4x", desc: "Deep reasoning" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek Chat", provider: "orcarouter", cost: "0.5x", desc: "Via OrcaRouter" },
  { value: "deepseek/deepseek-reasoner", label: "DeepSeek Reasoner", provider: "orcarouter", cost: "1.5x", desc: "Reasoning model" },
  { value: "grok/grok-4-fast-reasoning", label: "Grok 4 Fast", provider: "orcarouter", cost: "5x", desc: "Fast reasoning" },
  { value: "orcarouter/auto", label: "OrcaRouter Auto", provider: "orcarouter", cost: "0x", desc: "Auto-pick cheapest" },
]

export const MODELS: ModelEntry[] = [
  { value: SECTION_CLOUD, label: "Supercode Cloud", provider: "supercode", cost: "", desc: "" },
  ...CLOUD_MODELS,
  { value: SECTION_BYOK, label: "Bring Your Own Key", provider: "supercode", cost: "", desc: "" },
  ...BYOK_MODELS,
]

export class ModelPicker {
  items: ModelEntry[] = MODELS
  filterQuery = ""

  private _filtered: number[] = []
  filteredIndex = 0
  overlayLines = 0

  constructor() {
    this.computeFiltered()
  }

  private isSection(value: string): boolean {
    return ALL_SECTIONS.has(value)
  }

  private computeFiltered(): void {
    const q = this.filterQuery.toLowerCase().trim()
    this._filtered = this.items.reduce<number[]>((acc, item, idx) => {
      if (this.isSection(item.value)) {
        acc.push(idx)
        return acc
      }
      if (q && !item.label.toLowerCase().includes(q) && !item.value.toLowerCase().includes(q)) {
        return acc
      }
      acc.push(idx)
      return acc
    }, [])
    // Start at first non-section item
    this.filteredIndex = this._filtered.findIndex((i) => !this.isSection(this.items[i]!.value))
    if (this.filteredIndex < 0) this.filteredIndex = 0
  }

  setFilter(q: string): void {
    this.filterQuery = q
    this.computeFiltered()
  }

  getSelected(): ModelEntry {
    const item = this.items[this._filtered[this.filteredIndex]!]!
    if (this.isSection(item.value)) {
      for (const idx of this._filtered) {
        if (!this.isSection(this.items[idx]!.value)) return this.items[idx]!
      }
    }
    return item
  }

  selectNext(): void {
    if (this._filtered.length === 0) return
    let next = (this.filteredIndex + 1) % this._filtered.length
    let attempts = 0
    while (attempts < this._filtered.length && this.isSection(this.items[this._filtered[next]!]!.value)) {
      next = (next + 1) % this._filtered.length
      attempts++
    }
    if (!this.isSection(this.items[this._filtered[next]!]!.value)) {
      this.filteredIndex = next
    }
  }

  selectPrev(): void {
    if (this._filtered.length === 0) return
    let prev = (this.filteredIndex - 1 + this._filtered.length) % this._filtered.length
    let attempts = 0
    while (attempts < this._filtered.length && this.isSection(this.items[this._filtered[prev]!]!.value)) {
      prev = (prev - 1 + this._filtered.length) % this._filtered.length
      attempts++
    }
    if (!this.isSection(this.items[this._filtered[prev]!]!.value)) {
      this.filteredIndex = prev
    }
  }

  render(
    width: number,
    currentProvider: string,
    currentModel: string,
  ): string[] {
    const lines: string[] = []
    const allIndices = this._filtered
    if (allIndices.length === 0) return lines

    const maxVisible = 10
    const half = Math.floor(maxVisible / 2)

    let startIdx = Math.max(0, this.filteredIndex - half)
    let endIdx = Math.min(allIndices.length, startIdx + maxVisible)
    if (endIdx - startIdx < maxVisible && startIdx > 0) {
      startIdx = Math.max(0, endIdx - maxVisible)
    }

    const visibleSlice = allIndices.slice(startIdx, endIdx)
    const hasPrev = startIdx > 0
    const hasNext = endIdx < allIndices.length

    const divider = heavyDivider()
    lines.push(divider)
    lines.push(
      ` ${chalk.hex(theme.greenGlow)("Switch Model")} ${chalk.hex(theme.muted)("· ")}`,
    )

    // Search bar
    if (this.filterQuery) {
      lines.push(
        ` ${chalk.hex(theme.greenDim)("Search:")} ${chalk.hex(theme.white)(this.filterQuery)}${chalk.hex(theme.amber)(CARET)}`,
      )
    } else {
      lines.push(
        ` ${chalk.hex(theme.greenDim)("Search:")} ${chalk.hex(theme.muted)("type to filter · ↑↓ navigate · enter select · esc cancel")}`,
      )
    }

    lines.push(divider)

    if (hasPrev) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▲ ${startIdx} more`)}`)
    }

    let currentMainSection = ""
    for (const idx of visibleSlice) {
      const m = this.items[idx]!

      if (this.isSection(m.value)) {
        const main = isMainSection(m.value)
        if (main) {
          currentMainSection = m.value
          lines.push(` ${chalk.hex(theme.greenDim).bold(SECTION_LABELS[m.value]!)}`)
        } else {
          // Provider sub-section under BYOK
          const indent = currentMainSection === SECTION_BYOK ? "  " : " "
          const sectionLabel = SECTION_LABELS[m.value]
          const count = visibleSlice.filter((i) => {
            const item = this.items[i]!
            return !this.isSection(item.value) && item.provider === m.provider
          }).length
          const countStr = count > 0 ? ` ${chalk.hex(theme.dim)(`${count}`)}` : ""
          lines.push(
            `${indent}${chalk.hex(theme.greenDim).bold(sectionLabel)}${countStr}`,
          )
        }
        continue
      }

      const isCurrent =
        m.provider === currentProvider && m.value === currentModel
      const isSelected = idx === this._filtered[this.filteredIndex]

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
      const cloudTag =
        m.provider === "supercode" && !isCurrent
          ? ` ${chalk.bgHex(theme.green).hex(theme.black).bold(" CLOUD ")}`
          : ""
      const freeTag =
        !isCurrent && m.cost === "free" && m.provider !== "supercode"
          ? ` ${chalk.bgHex(theme.green).hex(theme.black).bold(" FREE ")}`
          : ""

      const label = `${prefix} ${name} ${cost}${desc}${marker}${cloudTag}${freeTag}`

      if (isSelected) {
        const bg = chalk.bgHex(theme.greenDeep)
        lines.push(bg(label.padEnd(width)))
      } else {
        lines.push(label)
      }
    }

    if (hasNext) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▼ ${allIndices.length - endIdx} more`)}`)
    }

    lines.push(divider)
    this.overlayLines = lines.length
    return lines
  }
}

/**
 * Minimal raw-stdin key reader. Collects a buffer on each `data` event.
 * If the buffer starts with ESC, it waits up to 80ms for more bytes so that
 * escape sequences (arrows) are disambiguated from a lone Escape press.
 */
type KeyPress =
  | "up"
  | "down"
  | "enter"
  | "escape"
  | "backspace"
  | "ctrl_c"
  | "ctrl_u"
  | { char: string }

function readRawKey(): Promise<KeyPress> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0)

    const handler = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const b = Array.from(buf)

      if (b.length === 1) {
        // Enter
        if (b[0] === 0x0d || b[0] === 0x0a) {
          cleanup(); resolve("enter"); return
        }
        // Escape — wait briefly for more bytes
        if (b[0] === 0x1b) return
        // Ctrl+C
        if (b[0] === 0x03) {
          cleanup(); resolve("ctrl_c"); return
        }
        // Ctrl+U (clear line)
        if (b[0] === 0x15) {
          cleanup(); resolve("ctrl_u"); return
        }
        // Backspace (DEL or ^H)
        if (b[0] === 0x7f || b[0] === 0x08) {
          cleanup(); resolve("backspace"); return
        }
        // Printable ASCII (space through ~)
        if (b[0]! >= 0x20 && b[0]! <= 0x7e) {
          cleanup(); resolve({ char: String.fromCodePoint(b[0]!) }); return
        }
      }

      // Escape sequence: ESC [ A/B (up/down)
      if (b.length >= 2 && b[0] === 0x1b) {
        if (b[1] === 0x5b && b.length >= 3) {
          if (b[2] === 0x41) { cleanup(); resolve("up"); return }
          if (b[2] === 0x42) { cleanup(); resolve("down"); return }
          cleanup(); resolve("escape"); return
        }
        cleanup(); resolve("escape"); return
      }

      // Ignore everything else
      cleanup()
      process.stdin.once("data", handler)
    }

    const timeout = setTimeout(() => {
      if (buf.length === 1 && buf[0] === 0x1b) {
        cleanup()
        resolve("escape")
      } else {
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

export async function pickModel(
  providerFilter?: ModelProvider,
  opts?: { allowCustom?: boolean },
): Promise<{ provider: ModelProvider; model?: string }> {
  const stored = await getCliConfig()
  const currentProvider = stored?.provider || "supercode"
  const currentModel = stored?.model || "deepseek-v4-flash"

  const picker = new ModelPicker()
  if (providerFilter) {
    picker.items = MODELS.filter((m) => m.provider === providerFilter)
    if (opts?.allowCustom) {
      picker.items.push({
        value: "__custom__",
        label: "Custom model",
        provider: providerFilter,
        cost: "",
        desc: "Type any model name",
      })
    }
    picker.setFilter("")
  }
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
    } else if (key === "backspace") {
      picker.setFilter(picker.filterQuery.slice(0, -1))
      clear(picker.overlayLines)
      draw()
    } else if (key === "ctrl_u") {
      picker.setFilter("")
      clear(picker.overlayLines)
      draw()
    } else if (key === "ctrl_c") {
      process.stdout.write("^C\n")
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
      process.exit(1)
    } else if (typeof key === "object" && "char" in key) {
      picker.setFilter(picker.filterQuery + key.char)
      clear(picker.overlayLines)
      draw()
    }
  }

  // Restore terminal
  if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)

  // Clear the picker overlay
  clear(picker.overlayLines + 1)

  if (!selected) {
    return { provider: currentProvider as ModelProvider, model: currentModel }
  }

  if (selected.value === "__custom__") {
    process.stdout.write(`\n`)
    const customName = await text({
      message: chalk.hex(theme.green)(`enter model name for ${selected.provider}`),
      placeholder: "e.g. my-custom-model-v1",
    })
    if (isCancel(customName) || !(customName as string).trim()) {
      return { provider: selected.provider, model: undefined }
    }
    const trimmed = (customName as string).trim()
    process.stdout.write(
      `  ${chalk.hex(theme.green)("✓")} model set to ${chalk.hex(theme.greenGlow)(trimmed)}\n\n`,
    )
    return { provider: selected.provider, model: trimmed }
  }

  // For BYOK providers, check if an API key is configured
  if (selected.provider !== "supercode") {
    const config = await getCliConfig()
    const existingKey = config?.apiKeys?.[selected.provider] || getByokSessionKey(selected.provider)
    if (!existingKey) {
      process.stdout.write("\n")
      const meta = providerMeta[selected.provider]
      process.stdout.write(
        ` ${chalk.hex(theme.amber)("◆")}  ${chalk.hex(theme.green).bold(`${meta.label} needs an API key`)}

 ${chalk.hex(theme.muted)(meta.link ? `Get your key at: ${meta.link}` : "")}

`
      )
      const apiKey = await password({
        message: chalk.hex(theme.green)(`paste your ${meta.label} API key`),
        validate: (val: string | undefined) => {
          if (!val || val.trim().length < 8) return "Key looks too short — please check and try again"
        },
      })
      if (isCancel(apiKey)) {
        return { provider: selected.provider, model: undefined }
      }
      await saveProviderApiKey(selected.provider, apiKey as string)
      process.stdout.write(
        `  ${chalk.hex(theme.green)("✓")} ${meta.label} API key saved — requests will go direct (🔑)\n\n`,
      )
    }
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
  const label = p === "supercode" ? "Supercode Cloud" :
    p === "concentrateai" ? "ConcentrateAI" :
    p === "google" ? "Gemini" :
    p === "nvidia" ? "NVIDIA" : p === "minimax" ? "MiniMax" :
    p === "mergedev" ? "Merge Dev" : p === "orcarouter" ? "OrcaRouter" : "OpenRouter"
  return `${label}${m ? ` · ${m}` : ""}`
}
