import type { LanguageModel, ModelMessage } from "ai"
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.ts"
import { toolParametersToJsonSchema } from "./tools-util"
import {
  checkDailyOpusLimit,
  incrementDailyOpusCount,
} from "../../lib/token-budget"

const HIGH_VALUE_MODELS = [
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-4-7",
  "openai/gpt-5.5",
]
const OPUS_MODELS = [
  "anthropic/claude-opus-5",
  "anthropic/claude-opus-4-8",
  "anthropic/claude-opus-4-7",
]

function getConcentrateApiKey(): string {
  return (
    process.env.CONCENTRATE_BYOK_PROD_KEY ||
    process.env.CONCENTRATE_BYOK_DEV_KEY ||
    ""
  )
}

const BASE_URL = "https://api.concentrate.ai/v1"
const MAX_RETRIES = 3

async function fetchWithRetry(url: any, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (res.ok || res.status < 500) return res
    if (attempt >= MAX_RETRIES - 1) return res
    await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
  }
}

interface NonStreamingResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function nonStreamingRequest(
  modelName: string,
  system: string,
  messages: Array<{ role: string; content: string }>,
  tools?: any,
): Promise<NonStreamingResponse> {
  const body: Record<string, unknown> = {
    model: modelName,
    messages: system
      ? [{ role: "system", content: system }, ...messages]
      : messages,
    temperature: 0.7,
    stream: false,
  }
  if (!HIGH_VALUE_MODELS.includes(modelName)) body.max_tokens = 8192
  if (tools && typeof tools === "object") {
    body.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
      type: "function",
      function: {
        name,
        description: fn.description || "",
        parameters: toolParametersToJsonSchema(fn),
      },
    }))
  }
  const res = await fetchWithRetry(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getConcentrateApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error")
    if (res.status >= 500) {
      throw new Error(
        `ConcentrateAI is having trouble reaching this provider right now ` +
          `(HTTP ${res.status}). This is a gateway-side issue, not your request. ` +
          `Try again, or run /model to switch.\n  ${errText}`,
      )
    }
    throw new Error(`ConcentrateAI API ${res.status}: ${errText}`)
  }
  return (await res.json()) as NonStreamingResponse
}

/**
 * ConcentrateAI — shared OpenAI-compatible adapter + empty-stream fallback + opus budget.
 */
export class ConcentrateService {
  private adapter: OpenAICompatibleAdapter
  sendMessage: any
  readonly modelName: string
  get model(): LanguageModel {
    return this.adapter.model
  }

  constructor(modelName?: string) {
    const firstTokenMs =
      Number(process.env.SUPERCODE_FIRST_TOKEN_TIMEOUT_MS) || 45_000

    this.adapter = new OpenAICompatibleAdapter({
      providerId: "concentrateai",
      providerLabel: "ConcentrateAI",
      clientName: "concentrate",
      baseURL: BASE_URL,
      apiKey: getConcentrateApiKey(),
      modelName: modelName || "deepseek-v4-flash",
      missingKeyError:
        "ConcentrateAI is not configured.\n\n  Set CONCENTRATE_BYOK_PROD_KEY or CONCENTRATE_BYOK_DEV_KEY in your\n  environment, or run /connect to provide your API key.\n\n  Get a key at: https://concentrate.ai",
      fetch: fetchWithRetry as typeof fetch,
      highValueModels: HIGH_VALUE_MODELS,
      defaultMaxOutputTokens: 8192,
      toolLoop: "native",
      streamTimeoutMs: 120_000,
      firstTokenMs,
      useFullStream: true,
      maxSteps: 8,
      beforeSend: async (name) => {
        if (OPUS_MODELS.includes(name)) {
          await checkDailyOpusLimit()
          await incrementDailyOpusCount()
        }
      },
      emptyStreamFallback: async ({ modelName: m, system, messages, tools }) => {
        const data = await nonStreamingRequest(
          m,
          system,
          messages.map((msg: any) => ({
            role: msg.role,
            content:
              typeof msg.content === "string"
                ? msg.content
                : JSON.stringify(msg.content),
          })),
          tools,
        )
        return {
          content: data?.choices?.[0]?.message?.content ?? "",
          usage: data?.usage,
        }
      },
    })
    this.modelName = this.adapter.modelName
    this.sendMessage = this.adapter.sendMessage.bind(this.adapter)
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    return this.adapter.getMessage(messages, tools)
  }
}
