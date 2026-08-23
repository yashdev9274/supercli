import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth"
import cors from "cors"
import prisma from "./lib/prisma"
import { loadEnvOnce } from "./lib/load-env"
import { recordUsage } from "./lib/track-usage"
import { computeCost } from "./lib/pricing"
import { checkDailyTokenBudget } from "./lib/token-budget"
import { registerAnalyticsRoutes } from "./routes/analytics"
import plansRouter from "./api/billing/plans"
import checkoutRouter from "./api/billing/checkout"
import statusRouter from "./api/billing/status"
import refundRouter from "./api/billing/refund"
import webhookRouter from "./api/billing/webhook"
import { checkPlanGate } from "./lib/plan-gate"
import { transcribeAudio } from "./voice/speech"
import {
  getVoiceSession,
  isFinalizeAction,
  finalizeSlugFor,
  hasConfirmation,
  hasDenial,
} from "./voice/voiceSession"
import { tmpdir } from "os"
import { join } from "path"
import { writeFileSync, unlinkSync } from "fs"
import { exec } from "child_process"
import { randomUUID } from "crypto"
import { parseStreamedContent } from "./lib/embedded-tool-calls"
import {
  streamOpenAICompatibleChat,
  emitFromNonStreamingMessage,
  writeFinish,
  mergeKnownTools,
  serializeChatContent,
} from "./lib/openai-compatible-stream"
import { stripOrphanToolCalls } from "./cli/ai/sanitize-messages"

function toolParams(fn: any): object {
  const raw = fn.parameters ?? fn.inputSchema
  if (!raw || (typeof raw === "object" && "_def" in raw)) {
    return { type: "object", properties: {} }
  }
  return raw
}

// ── Aggressive tool-definition compression for context-limited models ───
// Strips ALL descriptions, collapses nested schemas, removes non-essential
// fields to fit tool definitions within 1M context.
function slimSchema(schema: any, depth = 0): any {
  if (!schema || typeof schema !== "object") return schema
  if (Array.isArray(schema)) return schema.map(s => slimSchema(s, depth + 1))

  // At depth > 2, collapse to just the bare type info
  if (depth > 2) {
    if (schema.type === "object" && schema.properties) {
      return { type: "object" }
    }
    return { type: schema.type || "string" }
  }

  const out: any = {}
  for (const [key, val] of Object.entries(schema)) {
    // Drop ALL verbose fields — only keep structural/schema essentials
    if (key === "description" || key === "default" || key === "examples" ||
        key === "title" || key === "$schema" || key === "deprecated" ||
        key === "format" || key === "pattern" || key === "minimum" ||
        key === "maximum" || key === "minLength" || key === "maxLength" ||
        key === "minItems" || key === "maxItems" || key === "uniqueItems" ||
        key === "additionalProperties" || key === "patternProperties" ||
        key === "if" || key === "then" || key === "else" || key === "not") {
      continue
    }

    if (key === "anyOf" || key === "oneOf" || key === "allOf") {
      const arr = val as any[]
      if (Array.isArray(arr) && arr.length > 0) {
        // Collapse unions to first branch
        out[key] = [slimSchema(arr[0], depth + 1)]
      }
      continue
    }
    if (key === "properties" && typeof val === "object") {
      const slimmed: any = {}
      for (const [propName, propVal] of Object.entries(val as any)) {
        slimmed[propName] = slimSchema(propVal, depth + 1)
      }
      out[key] = slimmed
      continue
    }
    if (key === "items" && typeof val === "object") {
      out[key] = slimSchema(val, depth + 1)
      continue
    }
    out[key] = val
  }
  return out
}

function slimToolDesc(desc: string): string {
  if (!desc) return ""
  // Aggressive truncation: first 50 chars only — enough to identify the tool
  const trimmed = desc.replace(/\s+/g, " ").trim()
  return trimmed.length > 50 ? trimmed.slice(0, 50) + "…" : trimmed
}

function slimToolParams(_fn: any): object {
  // Strip ALL parameter schema — just tell the model "this tool accepts an object"
  // Saves ~1M tokens vs full schema; the tool name + description is enough context
  return { type: "object", properties: {} }
}

function isStealthModel(model: string): boolean {
  return model.includes("stealth/ox-alpha")
}

function knownToolsFromRequest(tools: any): Set<string> {
  if (!tools || typeof tools !== "object") return mergeKnownTools()
  return mergeKnownTools(Object.keys(tools))
}

loadEnvOnce()

const port = process.env.PORT || 10000
const serverUrl = process.env.BETTER_AUTH_URL || `http://localhost:${port}`
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"

const MODEL_MAX_TOKENS: Record<string, number> = {
  "moonshotai/kimi-k2.6": 384,
  "deepseek/deepseek-v4-flash": 8192,
  "deepseek-ai/deepseek-v4-flash": 8192,
  "minimax/minimax-m3": 1024,
  "minimax/minimax-m3.5": 1024,
  "minimax/minimax-m2.5": 1024,
  "minimaxai/minimax-m3": 1024,
  "z-ai/glm-5.1": 512,
  "deepseek-v4-flash": 8192,
  "kimi-k2-6": 8192,
  "glm-5.2": 4096,
  "glm-5.1": 4096,
  "minimax-m3": 8192,
  "hy3": 8192,
  "anthropic/claude-fable-5": 128000,
  "anthropic/claude-opus-5": 128000,
  "anthropic/claude-opus-4-7": 128000,
  "anthropic/claude-opus-4-8": 128000,
  "openai/gpt-5.5": 128000,
  "stealth/ox-alpha": 32768,
}
function getModelMaxTokens(model: string): number {
  const exact = MODEL_MAX_TOKENS[model]
  if (exact !== undefined) return exact
  for (const [key, value] of Object.entries(MODEL_MAX_TOKENS)) {
    if (model.includes(key) || key.includes(model)) return value
  }
  return 8192
}

// Upper bound on an upstream (ConcentrateAI) request, including the full
// streaming body read. A stalled/frozen upstream would otherwise hang the
// turn indefinitely (the "worked for 60s+ then nothing" symptom).
const UPSTREAM_TIMEOUT_MS = Number(process.env.SUPERCODE_UPSTREAM_TIMEOUT_MS) || 120_000

// Models allowed through the server proxy without a user-provided API key
const CLOUD_ALLOWED_MODELS = new Set([
  "deepseek-v4-flash",
  "glm-5.2",
  "glm-5.1",
  "kimi-k2-6",
  "minimax-m3",
  "hy3",
  "mimo-v2.5",
  "fireworks/nemotron-3-ultra-nvfp4",
  "kimi-k2-7-code",
  "kimi-k3",
  "stealth/ox-alpha",
])
const JSON_BODY_LIMIT = process.env.SUPERCODE_JSON_BODY_LIMIT || "10mb"
const app = express()

app.use(
  cors({
    origin: [clientUrl, serverUrl].filter(Boolean),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
)
app.use("/api/auth", toNodeHandler(auth))

app.get("/", (req, res) => {
  const { error, error_description } = req.query
  if (error) {
    return res.redirect(
      `${clientUrl}/sign-in?error=${encodeURIComponent(error as string)}${error_description ? `&error_description=${encodeURIComponent(error_description as string)}` : ""}`,
    )
  }
  res.redirect(clientUrl)
})

app.get("/error", (req, res) => {
  const { error, error_description } = req.query
  res.redirect(
    `${clientUrl}/sign-in?error=${encodeURIComponent(error as string || "unknown")}${error_description ? `&error_description=${encodeURIComponent(error_description as string)}` : ""}`,
  )
})

app.use(express.json({ limit: JSON_BODY_LIMIT }))
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      res.status(413).json({
        error: `Request body is too large. Limit is ${JSON_BODY_LIMIT}.`,
      })
      return
    }

    next(error)
  },
)

registerAnalyticsRoutes(app, prisma)

app.use("/api/billing/plans", plansRouter)
app.use("/api/billing/checkout", checkoutRouter)
app.use("/api/billing/status", statusRouter)
app.use("/api/billing/refund", refundRouter)
app.use("/api/billing/webhook", webhookRouter)
// Alias so the Dodo dashboard's configured webhook URL works as documented in the plan
app.use("/api/webhooks/dodo-payments", webhookRouter)

app.get("/api/data/users/count", async (_req, res) => {
  try {
    const count = await prisma.user.count()
    res.json({ count })
  } catch (error) {
    console.error("[users/count] Error:", error)
    res.status(500).json({ error: "Failed to fetch user count" })
  }
})

app.get("/device", async (req, res) => {
  const { user_code } = req.query
  res.redirect(`${clientUrl}/device?user_code=${user_code}`)
})

app.get("/handle", (req, res) => {
  res.send("OK")
})

async function getUserFromBearer(req: express.Request) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice(7)
  try {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session || session.expiresAt < new Date()) return null
    return session.user
  } catch {
    return null
  }
}

app.get("/api/user/me", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" })
  }
})

app.get("/api/user/paid-tier-interest", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const existing = await prisma.paidTierInterest.findUnique({
      where: { userId: user.id },
    })
    res.json({ answered: existing !== null, interested: existing?.interested ?? null })
  } catch (error) {
    res.status(500).json({ error: "Failed to check paid tier interest" })
  }
})

app.post("/api/user/paid-tier-interest", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const { interested } = req.body
    if (typeof interested !== "boolean") {
      res.status(400).json({ error: "interested must be a boolean" })
      return
    }
    await prisma.paidTierInterest.upsert({
      where: { userId: user.id },
      update: { interested },
      create: { userId: user.id, interested },
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: "Failed to save paid tier interest" })
  }
})

app.post("/api/conversations", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const { id, mode = "chat" } = req.body
    if (id) {
      const existing = await prisma.conversation.findFirst({
        where: { id, userId: user.id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      })
      if (existing) {
        res.json(existing)
        return
      }
    }
    const conversation = await prisma.conversation.create({
      data: {
        userId: user.id,
        mode,
        title: `New ${mode} conversation`,
      },
    })
    res.json(conversation)
  } catch (error) {
    res.status(500).json({ error: "Failed to create conversation" })
  }
})

app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      orderBy: { createdAt: "asc" },
    })
    res.json(messages)
  } catch (error) {
    res.status(500).json({ error: "Failed to get messages" })
  }
})

app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const { role, content } = req.body
    const contentStr = typeof content === "string" ? content : JSON.stringify(content)
    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        role,
        content: contentStr,
      },
    })
    res.json(message)
  } catch (error) {
    res.status(500).json({ error: "Failed to save message" })
  }
})

app.put("/api/conversations/:id/mode", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const { mode } = req.body
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { mode },
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: "Failed to update mode" })
  }
})

app.post("/api/ai/chat", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { messages: rawMessages, provider, model: modelParam, tools } = req.body
    if (!rawMessages || !Array.isArray(rawMessages)) {
      res.status(400).json({ error: "Messages array is required" })
      return
    }

    // Drop orphan tool_calls before forwarding to upstream. Any assistant
    // message whose `tool_calls` entries lack a matching `tool` role message
    // makes ConcentrateAI (and several other OpenAI-compatible providers)
    // 400 with `function_call ... is missing a corresponding
    // function_call_output`. Both the client CLI and any prior turn of this
    // server may have left an orphan in the posted history; strip them here
    // so we never propagate them to the upstream provider.
    const messages = stripOrphanToolCalls(rawMessages as any)

    // Paid-tier enforcement: subscription → model access → request cap → credits
    const gate = await checkPlanGate(user.id, modelParam ?? "deepseek-v4-flash")
    if (!gate.allowed) {
      res.status(403).json({ error: "plan_limit_exceeded", message: gate.message })
      return
    }

    const isByok = provider === "concentrateai" && !!req.body.concentrateAiKey
    if (!isByok) {
      await checkDailyTokenBudget(user.id)
    }

    const systemMessages = messages.filter((m: any) => m.role === "system")
    const nonSystemMessages = messages.filter((m: any) => m.role !== "system")
    const system = systemMessages.map((m: any) => m.content).join("\n")

    res.setHeader("Content-Type", "application/x-ndjson")

    switch (provider) {
      case "google": {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Google Gemini not configured on server" }); return }
        const modelName = modelParam || "gemini-2.5-flash"
        const googleStart = Date.now()
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
        const { streamText } = await import("ai")
        const google = createGoogleGenerativeAI({ apiKey })
        const opts: any = { model: google(modelName), messages: nonSystemMessages }
        if (system) opts.system = system
        if (tools) { opts.tools = tools; opts.maxSteps = 5 }
        const result = streamText(opts)
        const embedded = parseStreamedContent({ knownTools: knownToolsFromRequest(tools) })
        let emittedToolCalls = false
        const fullStream = (result as any).fullStream
        if (fullStream && typeof fullStream[Symbol.asyncIterator] === "function") {
          for await (const part of fullStream) {
            const type = part?.type
            if (type === "text-delta" || type === "text") {
              const raw = part.textDelta ?? part.text ?? ""
              const blk = embedded.push(String(raw))
              if (blk.text) res.write(JSON.stringify({ type: "text", content: blk.text }) + "\n")
              for (const call of blk.calls) {
                emittedToolCalls = true
                res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_g_${Date.now()}` }) + "\n")
              }
            } else if (type === "reasoning" || type === "reasoning-delta") {
              const raw = part.textDelta ?? part.text ?? part.reasoning ?? ""
              if (raw) res.write(JSON.stringify({ type: "reasoning", content: String(raw) }) + "\n")
            } else if (type === "tool-call") {
              emittedToolCalls = true
              const name = part.toolName ?? part.name
              const args = part.args ?? part.input ?? {}
              const id = part.toolCallId ?? part.id ?? `call_g_${Date.now()}`
              if (name) res.write(JSON.stringify({ type: "tool-call", toolName: name, args, toolCallId: id }) + "\n")
            }
          }
        } else {
          for await (const chunk of result.textStream) {
            const blk = embedded.push(String(chunk))
            if (blk.text) res.write(JSON.stringify({ type: "text", content: blk.text }) + "\n")
            for (const call of blk.calls) {
              emittedToolCalls = true
              res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_g_${Date.now()}` }) + "\n")
            }
          }
        }
        const flushed = embedded.flush()
        if (flushed.text) res.write(JSON.stringify({ type: "text", content: flushed.text }) + "\n")
        for (const call of flushed.calls) {
          emittedToolCalls = true
          res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_g_${Date.now()}` }) + "\n")
        }
        const usage = await result.usage
        const inputTokens = usage.inputTokens ?? 0
        const outputTokens = usage.outputTokens ?? 0
        const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0
        const totalTokens = usage.totalTokens ?? (inputTokens + outputTokens)
        recordUsage({
          provider: "google", model: modelName,
          inputTokens, outputTokens, cachedInputTokens, totalTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, cachedInputTokens),
          durationMs: Date.now() - googleStart,
          userId: user.id,
        })
        const finishReason = emittedToolCalls ? "tool_calls" : (await result.finishReason)
        res.write(JSON.stringify({ type: "finish", reason: finishReason, usage }) + "\n")
        res.end()
        break
      }
      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) { res.status(500).json({ error: "OpenRouter not configured on server" }); return }
        const modelName = modelParam || process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free"
        const orStart = Date.now()
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: serializeChatContent(m.content),
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: getModelMaxTokens(modelName),
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools && !isStealthModel(modelName)) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: {
              name,
              description: fn.description || "",
              parameters: toolParams(fn),
            },
          }))
        }
        // Retry on 429 with exponential backoff (up to 3 attempts)
        let response: Response | null = null
        const MAX_RETRIES = 3
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(bodyObj),
          })
          if (response.status !== 429) break
          if (attempt < MAX_RETRIES - 1) {
            const delayMs = Math.min(2000 * Math.pow(2, attempt), 8000)
            await new Promise(r => setTimeout(r, delayMs))
          }
        }
        if (!response || !response.ok) {
          const errText = await response!.text().catch(() => "unknown error")
          res.status(response!.status).json({ error: `OpenRouter API ${response!.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        const inputTokens = streamed.usage.inputTokens
        const outputTokens = streamed.usage.outputTokens
        const emittedToolCalls = streamed.emittedToolCalls
        recordUsage({
          provider: "openrouter", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - orStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      case "minimax": {
        const apiKey = process.env.MINIMAX_API_KEY
        if (!apiKey) { res.status(500).json({ error: "MiniMax not configured on server" }); return }
        const modelName = modelParam || "MiniMax-M2"
        const mmStart = Date.now()
        const { createMinimax } = await import("vercel-minimax-ai-provider")
        const { streamText } = await import("ai")
        const minimax = createMinimax({ apiKey })
        const opts: any = {
          model: minimax(modelName),
          messages: nonSystemMessages,
          maxTokens: Number(process.env.MINIMAX_MAX_TOKENS) || 4096,
        }
        if (system) opts.system = system
        if (tools) { opts.tools = tools; opts.maxSteps = 5 }
        const result = streamText(opts)
        const embedded = parseStreamedContent({ knownTools: knownToolsFromRequest(tools) })
        let emittedToolCalls = false
        // Prefer fullStream when available so structured tool calls + reasoning
        // are preserved; fall back to textStream with embedded recovery.
        const fullStream = (result as any).fullStream
        if (fullStream && typeof fullStream[Symbol.asyncIterator] === "function") {
          for await (const part of fullStream) {
            const type = part?.type
            if (type === "text-delta" || type === "text") {
              const raw = part.textDelta ?? part.text ?? ""
              const blk = embedded.push(String(raw))
              if (blk.text) res.write(JSON.stringify({ type: "text", content: blk.text }) + "\n")
              for (const call of blk.calls) {
                emittedToolCalls = true
                res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_mm_${Date.now()}` }) + "\n")
              }
            } else if (type === "reasoning" || type === "reasoning-delta") {
              const raw = part.textDelta ?? part.text ?? part.reasoning ?? ""
              if (raw) res.write(JSON.stringify({ type: "reasoning", content: String(raw) }) + "\n")
            } else if (type === "tool-call") {
              emittedToolCalls = true
              const name = part.toolName ?? part.name
              const args = part.args ?? part.input ?? {}
              const id = part.toolCallId ?? part.id ?? `call_mm_${Date.now()}`
              if (name) res.write(JSON.stringify({ type: "tool-call", toolName: name, args, toolCallId: id }) + "\n")
            }
          }
        } else {
          for await (const chunk of result.textStream) {
            const blk = embedded.push(String(chunk))
            if (blk.text) res.write(JSON.stringify({ type: "text", content: blk.text }) + "\n")
            for (const call of blk.calls) {
              emittedToolCalls = true
              res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_mm_${Date.now()}` }) + "\n")
            }
          }
        }
        const flushed = embedded.flush()
        if (flushed.text) res.write(JSON.stringify({ type: "text", content: flushed.text }) + "\n")
        for (const call of flushed.calls) {
          emittedToolCalls = true
          res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: call.args, toolCallId: call.id || `call_mm_${Date.now()}` }) + "\n")
        }
        const usage = await result.usage
        const inputTokens = usage.inputTokens ?? 0
        const outputTokens = usage.outputTokens ?? 0
        const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0
        const totalTokens = usage.totalTokens ?? (inputTokens + outputTokens)
        recordUsage({
          provider: "minimax", model: modelName,
          inputTokens, outputTokens, cachedInputTokens, totalTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, cachedInputTokens),
          durationMs: Date.now() - mmStart,
          userId: user.id,
        })
        const finishReason = emittedToolCalls ? "tool_calls" : (await result.finishReason)
        res.write(JSON.stringify({ type: "finish", reason: finishReason, usage }) + "\n")
        res.end()
        break
      }
      case "nvidia": {
        const apiKey = process.env.NVIDIA_API_KEY
        if (!apiKey) { res.status(500).json({ error: "NVIDIA not configured on server" }); return }
        const modelName = modelParam || process.env.NVIDIA_MODEL || "minimaxai/minimax-m3"
        const nvidiaStart = Date.now()
        const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1"
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: m.content !== null && m.content !== undefined ? String(m.content) : "",
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: Number(process.env.NVIDIA_MAX_TOKENS) || 8192,
          temperature: Number(process.env.NVIDIA_TEMPERATURE) || 1,
          top_p: Number(process.env.NVIDIA_TOP_P) || 0.95,
          stream: true,
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: { name, description: fn.description || "", parameters: toolParams(fn) },
          }))
        }
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `NVIDIA API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        const inputTokens = streamed.usage.inputTokens
        const outputTokens = streamed.usage.outputTokens
        const emittedToolCalls = streamed.emittedToolCalls
        recordUsage({
          provider: "nvidia", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - nvidiaStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      case "mergedev": {
        const apiKey = process.env.MERGE_DEV_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Merge Dev not configured on server" }); return }
        const modelName = modelParam || "anthropic/claude-opus-4-8"
        const mdStart = Date.now()
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: m.content !== null && m.content !== undefined ? String(m.content) : "",
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: getModelMaxTokens(modelName),
          stream: true,
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: { name, description: fn.description || "", parameters: toolParams(fn) },
          }))
        }
        const response = await fetch("https://api-gateway.merge.dev/v1/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `Merge Dev API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        const inputTokens = streamed.usage.inputTokens
        const outputTokens = streamed.usage.outputTokens
        const emittedToolCalls = streamed.emittedToolCalls
        recordUsage({
          provider: "mergedev", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - mdStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      case "orcarouter": {
        const apiKey = process.env.ORCAROUTER_API_KEY
        if (!apiKey) { res.status(500).json({ error: "OrcaRouter not configured on server" }); return }
        const modelName = modelParam || "openai/gpt-4o-mini"
        const orStart = Date.now()
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: m.content !== null && m.content !== undefined ? String(m.content) : "",
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: getModelMaxTokens(modelName),
          temperature: 0.7,
          stream: true,
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: { name, description: fn.description || "", parameters: toolParams(fn) },
          }))
        }
        const response = await fetch("https://api.orcarouter.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `OrcaRouter API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        const inputTokens = streamed.usage.inputTokens
        const outputTokens = streamed.usage.outputTokens
        const emittedToolCalls = streamed.emittedToolCalls
        recordUsage({
          provider: "orcarouter", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - orStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      case "concentrateai": {
        const { concentrateAiKey: forwardedKey } = req.body
        const apiKey = forwardedKey || process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "ConcentrateAI not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
        if (!forwardedKey && !CLOUD_ALLOWED_MODELS.has(modelName)) {
          res.status(403).json({ error: `Bring your own API key to use ${modelName}` })
          return
        }
        const caStart = Date.now()
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: m.content !== null && m.content !== undefined ? String(m.content) : "",
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: getModelMaxTokens(modelName),
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: { name, description: fn.description || "", parameters: toolParams(fn) },
          }))
        }
        const response = await fetch("https://api.concentrate.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `ConcentrateAI API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        let streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        let fullContent = streamed.fullContent
        let reasoningContent = streamed.reasoningContent
        let emittedToolCalls = streamed.emittedToolCalls
        let inputTokens = streamed.usage.inputTokens
        let outputTokens = streamed.usage.outputTokens

        // If streaming didn't include usage data, estimate from content.
        if (inputTokens === 0 && outputTokens === 0) {
          const fullInput = JSON.stringify(nonSystemMessages).length + (system?.length ?? 0)
          inputTokens = Math.ceil(fullInput / 4)
          outputTokens = Math.ceil(fullContent.length / 4)
        }

        // Fallback: nothing useful streamed — retry as non-streaming.
        if (!fullContent.trim() && !emittedToolCalls) {
          const fbBody: any = {
            model: modelName,
            messages: nonSystemMessages.map((m: any) => {
              const msg: any = {
                role: m.role,
                content: m.content !== null && m.content !== undefined ? String(m.content) : "",
              }
              if (m.tool_calls) msg.tool_calls = m.tool_calls
              if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
              return msg
            }),
            max_tokens: getModelMaxTokens(modelName),
            temperature: 0.7,
            stream: false,
          }
          if (system && nonSystemMessages.length > 0) {
            fbBody.messages = [{ role: "system", content: system }, ...fbBody.messages]
          }
          const fbRes = await fetch("https://api.concentrate.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(fbBody),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          })
          if (fbRes.ok) {
            const fbData: any = await fbRes.json()
            const fbMsg = fbData?.choices?.[0]?.message ?? {}
            const fb = emitFromNonStreamingMessage(res, fbMsg, reasoningContent, knownToolsFromRequest(tools))
            if (fb.fullContent) fullContent = fb.fullContent
            if (fb.emittedToolCalls) emittedToolCalls = true
            inputTokens = fbData?.usage?.prompt_tokens ?? 0
            outputTokens = fbData?.usage?.completion_tokens ?? 0
          }
        }

        // Last resort: surface reasoning-as-text, or an explicit error so the
        // turn is never a silent blank line.
        if (!fullContent.trim() && !emittedToolCalls) {
          if (reasoningContent.trim()) {
            fullContent = reasoningContent
            res.write(JSON.stringify({ type: "text", content: reasoningContent }) + "\n")
          } else {
            res.write(JSON.stringify({
              type: "error",
              message: "The model returned an empty response (no text, reasoning, or tool calls). Please retry.",
            }) + "\n")
          }
        }

        recordUsage({
          provider: "concentrateai", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - caStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      case "supercode": {
        const apiKey = process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Supercode Cloud not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
        if (!CLOUD_ALLOWED_MODELS.has(modelName)) {
          res.status(403).json({ error: `Bring your own API key to use ${modelName}` })
          return
        }
        const scStart = Date.now()
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => {
            const msg: any = {
              role: m.role,
              content: m.content !== null && m.content !== undefined ? String(m.content) : "",
            }
            if (m.tool_calls) msg.tool_calls = m.tool_calls
            if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
            return msg
          }),
          max_tokens: getModelMaxTokens(modelName),
          temperature: 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
        }
        if (tools) {
          bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => ({
            type: "function",
            function: { name, description: fn.description || "", parameters: toolParams(fn) },
          }))
        }
        const response = await fetch("https://api.concentrate.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `Supercode Cloud API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        let streamed = await streamOpenAICompatibleChat({ res, reader, knownTools: knownToolsFromRequest(tools) })
        let fullContent = streamed.fullContent
        let reasoningContent = streamed.reasoningContent
        let emittedToolCalls = streamed.emittedToolCalls
        let inputTokens = streamed.usage.inputTokens
        let outputTokens = streamed.usage.outputTokens

        // If streaming didn't include usage data, estimate from content.
        if (inputTokens === 0 && outputTokens === 0) {
          const fullInput = JSON.stringify(nonSystemMessages).length + (system?.length ?? 0)
          inputTokens = Math.ceil(fullInput / 4)
          outputTokens = Math.ceil(fullContent.length / 4)
        }

        // Fallback: nothing useful streamed — retry as non-streaming.
        if (!fullContent.trim() && !emittedToolCalls) {
          const fbBody: any = {
            model: modelName,
            messages: nonSystemMessages.map((m: any) => {
              const msg: any = {
                role: m.role,
                content: m.content !== null && m.content !== undefined ? String(m.content) : "",
              }
              if (m.tool_calls) msg.tool_calls = m.tool_calls
              if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
              return msg
            }),
            max_tokens: getModelMaxTokens(modelName),
            temperature: 0.7,
            stream: false,
          }
          if (system && nonSystemMessages.length > 0) {
            fbBody.messages = [{ role: "system", content: system }, ...fbBody.messages]
          }
          const fbRes = await fetch("https://api.concentrate.ai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(fbBody),
            signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          })
          if (fbRes.ok) {
            const fbData: any = await fbRes.json()
            const fbMsg = fbData?.choices?.[0]?.message ?? {}
            const fb = emitFromNonStreamingMessage(res, fbMsg, reasoningContent, knownToolsFromRequest(tools))
            if (fb.fullContent) fullContent = fb.fullContent
            if (fb.emittedToolCalls) emittedToolCalls = true
            inputTokens = fbData?.usage?.prompt_tokens ?? 0
            outputTokens = fbData?.usage?.completion_tokens ?? 0
          }
        }

        // Last resort: surface reasoning-as-text, or an explicit error so the
        // turn is never a silent blank line.
        if (!fullContent.trim() && !emittedToolCalls) {
          if (reasoningContent.trim()) {
            fullContent = reasoningContent
            res.write(JSON.stringify({ type: "text", content: reasoningContent }) + "\n")
          } else {
            res.write(JSON.stringify({
              type: "error",
              message: "The model returned an empty response (no text, reasoning, or tool calls). Please retry.",
            }) + "\n")
          }
        }

        recordUsage({
          provider: "supercode", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - scStart,
          userId: user.id,
        })
        writeFinish(res, { emittedToolCalls, inputTokens, outputTokens })
        break
      }
      default: {
        res.status(400).json({ error: `Unknown provider: ${provider}` })
      }
    }
  } catch (error) {
    const msg = String(error)
    if (msg.includes("insufficient balance") || msg.includes("402")) {
      res.status(402).json({ error: "MiniMax API: insufficient balance. Top up at https://platform.minimax.ai" })
    } else if (msg.includes("daily limit of")) {
      res.status(429).json({ error: msg })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})

app.post("/api/ai/generate-object", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { provider, model: modelParam, schema, prompt } = req.body
    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" })
      return
    }

    const isByok = provider === "concentrateai" && !!req.body.concentrateAiKey
    if (!isByok) {
      await checkDailyTokenBudget(user.id)
    }

    const { generateObject } = await import("ai")

    switch (provider) {
      case "google": {
        const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Google Gemini not configured on server" }); return }
        const { createGoogleGenerativeAI } = await import("@ai-sdk/google")
        const google = createGoogleGenerativeAI({ apiKey })
        const modelName = modelParam || "gemini-2.5-flash"
        const result = await generateObject({ model: google(modelName), schema: schema as any, prompt })
        res.json({ object: result.object })
        break
      }
      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) { res.status(500).json({ error: "OpenRouter not configured on server" }); return }
        const modelName = modelParam || process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free"
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: getModelMaxTokens(modelName),
            temperature: 0.7,
            stream: false,
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `OpenRouter API ${response.status}: ${errText}` })
          return
        }
        const data: any = await response.json()
        res.json({ object: { content: data.choices?.[0]?.message?.content || "" } })
        break
      }
      case "minimax": {
        const apiKey = process.env.MINIMAX_API_KEY
        if (!apiKey) { res.status(500).json({ error: "MiniMax not configured on server" }); return }
        const { createMinimax } = await import("vercel-minimax-ai-provider")
        const minimax = createMinimax({ apiKey })
        const modelName = modelParam || "MiniMax-M2"
        const result = await generateObject({ model: minimax(modelName), schema: schema as any, prompt })
        res.json({ object: result.object })
        break
      }
      case "mergedev": {
        const apiKey = process.env.MERGE_DEV_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Merge Dev not configured on server" }); return }
        const modelName = modelParam || "anthropic/claude-opus-4-8"
        const response = await fetch("https://api-gateway.merge.dev/v1/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: getModelMaxTokens(modelName),
            stream: false,
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `Merge Dev API ${response.status}: ${errText}` })
          return
        }
        const data: any = await response.json()
        res.json({ object: { content: data.choices?.[0]?.message?.content || "" } })
        break
      }
      case "orcarouter": {
        const apiKey = process.env.ORCAROUTER_API_KEY
        if (!apiKey) { res.status(500).json({ error: "OrcaRouter not configured on server" }); return }
        const modelName = modelParam || "openai/gpt-4o-mini"
        const response = await fetch("https://api.orcarouter.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: getModelMaxTokens(modelName),
            stream: false,
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `OrcaRouter API ${response.status}: ${errText}` })
          return
        }
        const data: any = await response.json()
        res.json({ object: { content: data.choices?.[0]?.message?.content || "" } })
        break
      }
      case "concentrateai": {
        const { concentrateAiKey: forwardedKey } = req.body
        const apiKey = forwardedKey || process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "ConcentrateAI not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
        if (!forwardedKey && !CLOUD_ALLOWED_MODELS.has(modelName)) {
          res.status(403).json({ error: `Bring your own API key to use ${modelName}` })
          return
        }
        const response = await fetch("https://api.concentrate.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: getModelMaxTokens(modelName),
            temperature: 0.7,
            stream: false,
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `ConcentrateAI API ${response.status}: ${errText}` })
          return
        }
        const data: any = await response.json()
        res.json({ object: { content: data.choices?.[0]?.message?.content || "" } })
        break
      }
      case "supercode": {
        const apiKey = process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "Supercode Cloud not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
        if (!CLOUD_ALLOWED_MODELS.has(modelName)) {
          res.status(403).json({ error: `Bring your own API key to use ${modelName}` })
          return
        }
        const response = await fetch("https://api.concentrate.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            max_tokens: getModelMaxTokens(modelName),
            temperature: 0.7,
            stream: false,
          }),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `Supercode Cloud API ${response.status}: ${errText}` })
          return
        }
        const data: any = await response.json()
        res.json({ object: { content: data.choices?.[0]?.message?.content || "" } })
        break
      }
      default: {
        res.status(400).json({ error: `Provider ${provider} not supported for structured generation` })
      }
    }
  } catch (error) {
    const msg = String(error)
    if (msg.includes("insufficient balance") || msg.includes("402")) {
      res.status(402).json({ error: "MiniMax API: insufficient balance. Top up at https://platform.minimax.ai" })
    } else if (msg.includes("daily limit of")) {
      res.status(429).json({ error: msg })
    } else {
      res.status(500).json({ error: msg })
    }
  }
})

app.put("/api/conversations/:id/title", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }
    const { title } = req.body
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { title },
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: "Failed to update title" })
  }
})

// ── Tool proxy endpoints (use server-side API keys) ──

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"
const EXA_BASE = "https://api.exa.ai"
const CONTEXT_DEV_BASE = "https://api.context.dev/v1"

/// Compact human-readable summary of a Composio tool result for the app's
/// Dynamic Island tool-call metadata (capped to 300 chars).
function summarizeToolEvent(data: unknown, error: unknown, successful: boolean): string {
  if (!successful) {
    const msg = typeof error === "string" ? error : error != null ? JSON.stringify(error) : "Tool execution failed"
    return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg
  }
  if (data == null) return "Done"
  if (typeof data === "string") return data.length > 300 ? `${data.slice(0, 300)}…` : data
  const text = JSON.stringify(data)
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

/// Web search for the voice agent. Prefers the provider the model called, then
/// falls back to the other configured provider so a single key still works.
async function runWebSearch(
  query: string,
  numResults: number,
  preferred: "context_dev_search" | "exa_search",
): Promise<{
  results: Array<{ title: string; snippet: string; url: string }>
  provider: "contextdev" | "exa" | "none"
  error?: string
}> {
  const contextDevKey = process.env.CONTEXT_DEV_API_KEY || process.env.CONTEXTDEV_API_KEY
  const exaKey = process.env.EXA_API_KEY
  const order: Array<"contextdev" | "exa"> = preferred === "context_dev_search" ? ["contextdev", "exa"] : ["exa", "contextdev"]

  for (const provider of order) {
    if (provider === "contextdev" && contextDevKey) {
      try {
        const res = await fetch(`${CONTEXT_DEV_BASE}/web/search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${contextDevKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, numResults }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) continue
        const data = (await res.json()) as {
          results?: Array<{ title?: string; description?: string; url?: string }>
        }
        return {
          provider: "contextdev",
          results: (data.results ?? []).slice(0, numResults).map((r) => ({
            title: r.title ?? "",
            snippet: r.description ?? "",
            url: r.url ?? "",
          })),
        }
      } catch { /* fall through to the next provider */ }
    }
    if (provider === "exa" && exaKey) {
      try {
        const res = await fetch(`${EXA_BASE}/search`, {
          method: "POST",
          headers: { "x-api-key": exaKey, "Content-Type": "application/json" },
          body: JSON.stringify({ query, numResults }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) continue
        const data = (await res.json()) as {
          results?: Array<{ title?: string; text?: string; snippet?: string; url?: string }>
        }
        return {
          provider: "exa",
          results: (data.results ?? []).slice(0, numResults).map((r) => ({
            title: r.title ?? "",
            snippet: r.text ?? r.snippet ?? "",
            url: r.url ?? "",
          })),
        }
      } catch { /* fall through */ }
    }
  }
  return { provider: "none", results: [], error: "Web search not configured" }
}

/// Opens an app or website on the user's Mac via the `open` command. The server
/// runs locally, so this launches real applications and the default browser.
function openLocalTarget(app: string, url: string): Promise<{ message?: string; error?: string }> {
  return new Promise((resolve) => {
    const esc = (s: string) => s.replace(/["\\`$]/g, "")

    let command: string
    if (url) {
      const target = /^https?:\/\//.test(url) ? url : `https://${url}`
      command = `open "${esc(target)}"`
    } else if (app) {
      command = `open -a "${esc(app)}"`
    } else {
      resolve({ error: "open_app: provide either an app name or a URL" })
      return
    }

    exec(command, { timeout: 15_000 }, (err, _stdout, stderr) => {
      if (err) resolve({ error: stderr?.trim() || err.message })
      else resolve({ message: url ? `Opened ${url}` : `Opened ${app}` })
    })
  })
}

/// System controls for the voice agent: volume, lock screen, sleep display,
/// quit apps, and media playback. Volume/lock/sleep need no special
/// permissions; media keys use System Events and require Accessibility access.
function runSystemControl(action: string, appName = ""): Promise<{ message?: string; error?: string }> {
  return new Promise((resolve) => {
    const esc = (s: string) => s.replace(/["\\`$]/g, "")
    const run = (command: string, args: string[], successMsg: string) => {
      exec(`"${command}"${args.map((a) => ` ${JSON.stringify(a)}`).join("")}`, { timeout: 15_000 }, (err, _stdout, stderr) => {
        if (err) resolve({ error: stderr?.trim() || err.message || "Command failed" })
        else resolve({ message: successMsg })
      })
    }
    const osa = (script: string, successMsg: string) => {
      exec(`osascript -e ${JSON.stringify(script)}`, { timeout: 15_000 }, (err, _stdout, stderr) => {
        if (err) resolve({ error: stderr?.trim() || err.message || "osascript failed" })
        else resolve({ message: successMsg })
      })
    }
    const mediaKey = (code: number, successMsg: string) =>
      osa(`tell application "System Events" to key code ${code} using control down`, successMsg)

    switch (action) {
      case "volume_up":
      case "volume_down": {
        exec(`osascript -e ${JSON.stringify("output volume of (get volume settings)")}`, { timeout: 15_000 }, (err, stdout) => {
          if (err) { resolve({ error: err.message || "Failed to read volume" }); return }
          const current = Math.max(0, Math.min(100, parseInt(stdout?.trim() || "50", 10) || 50))
          const next = action === "volume_up" ? Math.min(current + 10, 100) : Math.max(current - 10, 0)
          osa(`set volume output volume ${next}`, `Volume ${action === "volume_up" ? "increased" : "decreased"} to ${next}`)
        })
        break
      }
      case "mute":
        osa("set volume output muted true", "Volume muted")
        break
      case "unmute":
        osa("set volume output muted false", "Volume unmuted")
        break
      case "lock_screen":
        run("/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession", ["-suspend"], "Screen locked")
        break
      case "sleep_display":
        run("/usr/bin/pmset", ["displaysleepnow"], "Display put to sleep")
        break
      case "quit_app":
        if (!appName) {
          resolve({ error: "system_control quit_app: provide the app name in `app`" })
          break
        }
        osa(`tell application "${esc(appName)}" to quit`, `Quit ${appName}`)
        break
      case "media_play_pause":
        mediaKey(16, "Media play/pause toggled")
        break
      case "media_next":
        mediaKey(17, "Next track")
        break
      case "media_prev":
        mediaKey(18, "Previous track")
        break
      default:
        resolve({ error: `system_control: unknown action "${action}"` })
    }
  })
}

app.post("/api/tools/firecrawl-search", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Firecrawl not configured on server" }); return }

    const response = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Firecrawl search proxy failed" })
  }
})

app.post("/api/tools/firecrawl-scrape", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Firecrawl not configured on server" }); return }

    const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Firecrawl scrape proxy failed" })
  }
})

app.post("/api/tools/firecrawl-map", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Firecrawl not configured on server" }); return }

    const response = await fetch(`${FIRECRAWL_BASE}/map`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(60000),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Firecrawl map proxy failed" })
  }
})

app.post("/api/tools/exa-search", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.EXA_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Exa search not configured on server" }); return }

    const response = await fetch(`${EXA_BASE}/search`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Exa search proxy failed" })
  }
})

app.post("/api/tools/exa-fetch", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.EXA_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Exa fetch not configured on server" }); return }

    const response = await fetch(`${EXA_BASE}/contents`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30000),
    })
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Exa fetch proxy failed" })
  }
})

// ── Composio session proxy (server-side API key) ──

app.post("/api/composio/session", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.COMPOSIO_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Composio not configured on server" }); return }

    const { Composio } = await import("@composio/core")
    const composio = new Composio({ apiKey })

    const connectedRes = await (composio.connectedAccounts as any).list({})
    const connectedIds: Record<string, string> = {}
    for (const acct of (connectedRes.items ?? [])) {
      if (acct.status === "ACTIVE") {
        connectedIds[acct.toolkit?.slug] = acct.id
      }
    }

    const s = await composio.sessions.create(`user_${user.id}`, {
      mcp: true,
      connectedAccounts: connectedIds,
    })

    res.json({
      url: (s as any).mcp.url as string,
      headers: (s as any).mcp.headers as Record<string, string>,
      sessionId: (s as any).session_id as string,
      apiKey,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Composio session creation failed" })
  }
})

app.post("/api/composio/apps", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.COMPOSIO_API_KEY
    if (!apiKey) { res.status(500).json({ error: "Composio not configured on server" }); return }

    const { Composio } = await import("@composio/core")
    const composio = new Composio({ apiKey })

    const [authConfigs, toolkits, connectedRes] = await Promise.all([
      (composio as any).authConfigs.list({}),
      (composio.toolkits as any).get(),
      (composio.connectedAccounts as any).list({}),
    ])

    const configuredSlugs = new Set<string>(
      (authConfigs.items ?? []).map((ac: any) => ac.toolkit?.slug).filter(Boolean),
    )

    const connectedMap = new Map<string, string>()
    for (const acct of connectedRes.items ?? []) {
      const slug: string = acct.toolkit?.slug
      if (slug && acct.status === "ACTIVE") {
        connectedMap.set(slug, acct.id)
      }
    }

    const toolkitMap = new Map<string, any>()
    for (const tk of toolkits) {
      toolkitMap.set(tk.slug, tk)
    }

    const apps: any[] = []
    for (const slug of configuredSlugs) {
      const tk = toolkitMap.get(slug)
      if (!tk) continue
      const conn = connectedMap.get(slug)
      apps.push({
        slug: tk.slug,
        name: tk.name,
        description: tk.meta?.description ?? "",
        logo: tk.meta?.logo,
        connected: !!conn,
        connectedAccountId: conn ?? null,
      })
    }

    apps.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    res.json({ apps })
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Composio list apps failed" })
  }
})

app.post("/api/tools/web-search", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const apiKey = process.env.GOOGLE_API_KEY
    const cx = process.env.GOOGLE_CSE_ID
    if (!apiKey || !cx) { res.status(500).json({ error: "Google Custom Search not configured on server" }); return }

    const { query, maxResults = 5 } = req.body
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`
    const response = await fetch(url)
    const data = await response.json()
    res.status(response.status).json(data)
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Web search proxy failed" })
  }
})

app.post("/api/voice/transcribe", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { base64, provider } = req.body
    if (!base64) {
      res.status(400).json({ error: "base64 audio data is required" })
      return
    }

    if (provider) process.env.STT_PROVIDER = provider

    const tmpFile = join(tmpdir(), `voice-transcribe-${randomUUID()}.wav`)
    writeFileSync(tmpFile, Buffer.from(base64, "base64"))

    try {
      const text = await transcribeAudio(tmpFile)
      res.json({ text })
    } finally {
      try { unlinkSync(tmpFile) } catch {}
    }
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// ---------------------------------------------------------------------------
// /api/voice/tts — text-to-speech via ElevenLabs, returns audio bytes
// ---------------------------------------------------------------------------
app.post("/api/voice/tts", async (req, res) => {
  try {
    const user = await getUserFromBearer(req)
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return }

    const { text } = req.body
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" })
      return
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) { res.status(500).json({ error: "ElevenLabs not configured" }); return }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"
    const modelId = process.env.ELEVENLABS_TTS_MODEL || "eleven_turbo_v2"

    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          output_format: "mp3_44100_128",
        }),
      },
    )

    if (!ttsRes.ok) {
      const err = await ttsRes.text()
      res.status(502).json({ error: `ElevenLabs error: ${ttsRes.status}`, detail: err })
      return
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer())
    res.setHeader("Content-Type", "audio/mpeg")
    res.setHeader("Content-Length", audioBuffer.length.toString())
    res.send(audioBuffer)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// ---------------------------------------------------------------------------
// /api/voice/chat — non-streaming LLM chat with optional tool-use
// ---------------------------------------------------------------------------
app.post("/api/voice/chat", async (req, res) => {
  try {
    const {
      messages,
      model: modelParam,
      provider = "concentrateai",
      tools: useTools = false,
      composioApiKey,
      composioUserId,
      screenImage,
      screenSelection = false,
    } = req.body
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" })
      return
    }

    const systemMessages = messages.filter((m: any) => m.role === "system")
    const nonSystemMessages = messages.filter((m: any) => m.role !== "system")

    // When tools are enabled, prepend a system directive so the LLM knows
    // it can search the web and open apps/websites on the user's Mac.
    const toolDirective = useTools
      ? "You are Jarvis, a concise and helpful AI assistant running on the user's Mac. " +
        "You have web search and can open apps, browsers, and websites on the computer. " +
        "When you don't know the answer to a factual question, use one of the web search tools " +
        "(context_dev_search, exa_search, or firecrawl_search) to find current information — " +
        "pick whichever fits the request: firecrawl_search for deep research or domain-filtered " +
        "searches, context_dev_search or exa_search for general queries. " +
        "When the user asks you to open an app, a browser, or a website, use the open_app tool — " +
        "you are allowed to do this and must not refuse. " +
        "When the user asks you to control their Mac — change the volume, mute or unmute, lock the " +
        "screen, put the display to sleep, quit an app, or control media playback — use the " +
        "system_control tool; you are allowed to do this and must not refuse. " +
        "Keep replies under 3 sentences unless asked for detail. " +
        "When citing search results, mention the source briefly."
      : ""

    // When a screenshot of the user's screen is attached, tell the model it can
    // see the screen and should answer screen-related questions from the image.
    const hasScreenImage = typeof screenImage === "string" && screenImage.length > 0
    const hasScreenSelection = screenSelection === true && hasScreenImage
    console.log(
      `[voice/chat] screenImage=${hasScreenImage ? `yes (${(screenImage.length / 1024).toFixed(0)}KB)` : "no"} screenSelection=${hasScreenSelection ? "yes" : "no"} model=${modelParam ?? "auto"} provider=${provider}`,
    )

    // --- DEBUG probe: dump the attached screenshot for offline inspection ---
    if (hasScreenImage) {
      try {
        const b64 = screenImage.replace(/^data:image\/[a-z0-9+.-]+;base64,/, "")
        const buf = Buffer.from(b64, "base64")
        const jpegDims = (b: Buffer): string => {
          try {
            let off = 2
            while (off + 9 < b.length) {
              if (b[off] !== 0xff) { off++; continue }
              const marker = b[off + 1]
              if (marker === undefined) break
              if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue }
              const len = b.readUInt16BE(off + 2)
              if (
                (marker >= 0xc0 && marker <= 0xc3) ||
                (marker >= 0xc5 && marker <= 0xc7) ||
                (marker >= 0xc9 && marker <= 0xcb) ||
                (marker >= 0xcd && marker <= 0xcf)
              ) {
                return `${b.readUInt16BE(off + 5)}x${b.readUInt16BE(off + 7)}`
              }
              off += 2 + len
            }
            return "no-sof"
          } catch {
            return "parse-error"
          }
        }
        const dest = `/tmp/voice_screen_dump_${Date.now()}.jpg`
        require("fs").writeFileSync(dest, buf)
        console.log(
          `[voice/chat] DEBUG attached image: ${buf.length} bytes raw, dims ${jpegDims(buf)}, saved ${dest}`,
        )
      } catch (e) {
        console.log(`[voice/chat] DEBUG image parse failed: ${e}`)
      }
    }

    const screenDirective = hasScreenImage
      ? "The user attached a screenshot of their current screen. You can see exactly " +
        "what is on their screen (apps, windows, text, UI elements). When the user asks " +
        "about something on screen (e.g. \"what's on my screen?\", \"read this\"), answer " +
        "from the screenshot. If a visible error appears, diagnose it from the image." +
        (hasScreenSelection
          ? " The attached screenshot shows ONLY the region the user selected with " +
            "Cmd+drag — it is a crop of the full screen, not the whole screen. Focus " +
            "exclusively on the selected content and ignore anything outside it; the user " +
            "wants context about exactly this region (e.g. explain just this part of the page)."
          : "")
      : ""

    // --- Composio context: expose the user's connected apps as tools ---
    // The app may pass its own Composio key + user id; otherwise fall back to
    // the server-level key and all active connected accounts.
    let composio: any = null
    let composioConnected: Array<{ slug: string; name: string; accountId: string }> = []
    let composioTools: any[] = []
    if (useTools) {
      const resolvedKey = (composioApiKey as string)?.trim() || process.env.COMPOSIO_API_KEY
      if (resolvedKey) {
        try {
          const { Composio } = await import("@composio/core")
          composio = new Composio({ apiKey: resolvedKey })

          const listParams: any = {}
          if (composioUserId) listParams.userIds = [String(composioUserId)]
          let connectedRes = await (composio.connectedAccounts as any).list(listParams)
          // Accounts may have been created without a userId; fall back to all
          // accounts if the userId filter returned nothing.
          if ((connectedRes.items ?? []).length === 0 && composioUserId) {
            connectedRes = await (composio.connectedAccounts as any).list({})
          }

          const toolkitSlugs = new Set<string>()
          for (const acct of connectedRes.items ?? []) {
            const slug: string = acct.toolkit?.slug
            if (slug && acct.status === "ACTIVE") {
              toolkitSlugs.add(slug)
              composioConnected.push({
                slug,
                name: acct.toolkit?.name || slug,
                accountId: acct.id,
              })
            }
          }

          if (toolkitSlugs.size > 0) {
            // Note: in this SDK version a multi-toolkit query returns only the
            // first toolkit's tools, so query each toolkit separately and merge.
            const seen = new Set<string>()
            for (const tk of toolkitSlugs) {
              try {
                const toolRes = await (composio.tools as any).getRawComposioTools({ toolkits: [tk] })
                const list = (Array.isArray(toolRes) ? toolRes : toolRes?.items ?? [])
                for (const t of list) {
                  if (!t.isDeprecated && !seen.has(t.slug)) {
                    seen.add(t.slug)
                    composioTools.push(t)
                  }
                }
              } catch { /* skip toolkit */ }
            }
          }
        } catch (err: any) {
          console.error("Composio context setup failed:", err?.message || err)
          composio = null
          composioConnected = []
          composioTools = []
        }
      }
    }

    const composioDirective =
      composioConnected.length > 0
        ? "You can access the user's connected apps via Composio tools. " +
          `Currently connected apps: ${composioConnected.map((c) => c.name).join(", ")}. ` +
          "Use the provided composio tools to read, write, or update data in these apps when the user asks " +
          "(e.g. fetch emails, create events, post messages, create/update issues).\n" +
          "When the user asks you to write, send, post, create, or update something in a connected app " +
          "(email, message, issue, event, page, pull request), follow this step-by-step workflow:\n" +
          "1. If any required detail is missing (recipient, subject, message content, title, date, etc.), " +
          "do NOT call any tool. Ask the user for the missing details.\n" +
          "2. When all details are provided, prepare the item with the create/draft variant (e.g. gmail_create_draft) " +
          "— do NOT call the send/finalize variant yet.\n" +
          "3. After preparing, tell the user it is ready and ask for confirmation, e.g. \"Shall I send it?\" " +
          "or \"Shall I create it?\".\n" +
          "4. Only when the user explicitly confirms (yes, send it, go ahead, do it, proceed) call the " +
          "send/finalize variant (e.g. gmail_send_email). If the user requests changes, use the update variant " +
          "and ask for confirmation again.\n" +
          "If the user has already confirmed or is clearly ordering the immediate action, you may execute the " +
          "finalizing action directly."
        : ""

    // --- Conversational state: track prepared-but-unconfirmed actions so the
    // agent can draft first and only finalize after explicit user confirmation.
    const sessionUserId = String(composioUserId || "voice-user")
    const session = getVoiceSession(sessionUserId)
    const lastUserMessage = [...nonSystemMessages].reverse().find((m: any) => m.role === "user")
    const lastUserText = typeof lastUserMessage?.content === "string" ? lastUserMessage.content : ""
    const confirmed = hasConfirmation(lastUserText)
    const denied = !confirmed && hasDenial(lastUserText)
    if (denied && session.pendingAction) {
      session.pendingAction = null
    }

    const system = [toolDirective, screenDirective, composioDirective, ...systemMessages.map((m: any) => m.content)].filter(Boolean).join("\n")

    // Tool definitions in OpenAI format (web search + open_app + composio tools for voice)
    const toolDefs = useTools
      ? [
          {
            type: "function",
            function: {
              name: "context_dev_search",
              description:
                "Search the web using Context.dev. Returns relevant results with titles, snippets, and URLs. " +
                "Use this when you don't know the answer to a factual question.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                  maxResults: { type: "number", description: "Max results (1-10)", default: 5 },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "exa_search",
              description:
                "Search the web using Exa. Returns relevant results with titles, snippets, and URLs. " +
                "Use this when you don't know the answer to a factual question.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                  maxResults: { type: "number", description: "Max results (1-10)", default: 5 },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "firecrawl_search",
              description:
                "Search the web using Firecrawl. Returns relevant results with titles, snippets, and URLs. " +
                "Supports domain filtering. Use this for deep research, documentation lookups, " +
                "or when you need results filtered to specific domains.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                  maxResults: { type: "number", description: "Max results (1-10)", default: 5 },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "open_app",
              description:
                "Open an app, browser, or website on the user's Mac. Use this when the user asks to open " +
                "any application (e.g. Chrome, Safari, Spotify, WhatsApp), a browser, or a website " +
                "(e.g. \"open YouTube\", \"open gmail\"). Pass `app` for an installed application " +
                "(e.g. \"Safari\", \"WhatsApp\") or `url` for a website (e.g. \"https://www.youtube.com\").",
              parameters: {
                type: "object",
                properties: {
                  app: { type: "string", description: "Name of the application to open, e.g. \"Safari\", \"WhatsApp\"" },
                  url: { type: "string", description: "Full URL of the website to open, e.g. \"https://www.youtube.com\"" },
                },
              },
            },
          },
          {
            type: "function",
            function: {
              name: "system_control",
              description:
                "Control the user's Mac system: volume (volume_up, volume_down, mute, unmute), " +
                "lock the screen (lock_screen), put the display to sleep (sleep_display), quit an " +
                "app (quit_app — pass the app name in `app`), or control media playback " +
                "(media_play_pause, media_next, media_prev). Use this when the user asks to change " +
                "the volume, lock or sleep the Mac, quit an app, or control music/video playback.",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    description:
                      "One of: volume_up, volume_down, mute, unmute, lock_screen, sleep_display, " +
                      "quit_app, media_play_pause, media_next, media_prev",
                  },
                  app: { type: "string", description: "App name for quit_app, e.g. \"Spotify\"" },
                },
                required: ["action"],
              },
            },
          },
          ...composioTools.map((t: any) => {
            const rawParams = t.inputParameters
            const parameters =
              rawParams && typeof rawParams === "object" && !("_def" in rawParams)
                ? rawParams
                : { type: "object", properties: {} }
            return {
              type: "function",
              function: {
                name: t.slug,
                description: t.description || t.name,
                parameters,
              },
            }
          }),
        ]
      : undefined

    if (provider === "concentrateai") {
      const apiKey = process.env.CONCENTRATEAI_API_KEY
      if (!apiKey) { res.status(500).json({ error: "ConcentrateAI not configured" }); return }

      // When a screenshot is attached, route to a vision-capable model.
      const defaultVisionModel = process.env.SCREEN_VISION_MODEL || "qwen3-vl-flash"
      const model = modelParam || (hasScreenImage ? defaultVisionModel : "deepseek-v4-flash")

      const apiMessages = nonSystemMessages.map((m: any) => ({
        role: m.role,
        content: m.content !== null && m.content !== undefined ? String(m.content) : "",
      }))
      if (system && apiMessages.length > 0) {
        apiMessages.unshift({ role: "system", content: system })
      }

      // Attach the screenshot as a multimodal image part on the last user message.
      // OpenAI-style content arrays keep tool follow-up working because the image
      // lives on the user message that is replayed in the second call.
      if (hasScreenImage && apiMessages.length > 0) {
        const last = apiMessages[apiMessages.length - 1] as any
        const text = typeof last.content === "string" ? last.content : ""
        last.content = [
          { type: "text", text },
          { type: "image_url", image_url: { url: screenImage } },
        ]
      }

      // --- First LLM call (with tools) ---
      const body: any = {
        model,
        messages: apiMessages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: false,
      }
      if (toolDefs) body.tools = toolDefs

      const response = await fetch("https://api.concentrate.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(toolDefs ? 90_000 : 30_000),
      })

      if (!response.ok) {
        const errBody = await response.text()
        res.status(502).json({ error: `ConcentrateAI error: ${response.status}`, detail: errBody })
        return
      }

      const data: any = await response.json()
      const assistantMessage = data.choices?.[0]?.message

      // --- Handle tool calls (max 1 round for voice) ---
      if (assistantMessage?.tool_calls?.length > 0 || (confirmed && session.pendingAction !== null && composio)) {
        const toolResults: Array<{ name: string; text: string }> = []
        // Metadata for each executed tool, returned to the app so the Dynamic
        // Island can render per-app activity (slug, toolkit, app, status, summary).
        const toolEvents: Array<{
          slug: string
          toolkit: string | null
          app: string | null
          status: "success" | "error" | "pending"
          summary: string
          arguments: Record<string, unknown>
        }> = []

        for (const toolCall of assistantMessage.tool_calls) {
          const fnName = toolCall.function?.name
          let fnArgs: Record<string, unknown> = {}
          try {
            fnArgs = typeof toolCall.function?.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : (toolCall.function?.arguments ?? {})
          } catch { /* ignore parse errors */ }

          let toolResult = ""

          if (fnName === "exa_search" || fnName === "context_dev_search") {
            const query = String(fnArgs.query ?? "")
            const numResults = Math.min((fnArgs.maxResults as number) ?? 5, 10)
            const { results, provider, error } = await runWebSearch(query, numResults, fnName)
            toolResult = error
              ? JSON.stringify({ error })
              : JSON.stringify({ results })
            toolEvents.push({
              slug: fnName,
              toolkit: provider,
              app: "Web Search",
              status: error ? "error" : "success",
              summary: error
                ? error
                : results.length > 0
                  ? `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
                  : "No search results found",
              arguments: fnArgs,
            })
          } else if (fnName === "firecrawl_search") {
            const query = String(fnArgs.query ?? "")
            const numResults = Math.min((fnArgs.maxResults as number) ?? 5, 10)
            const apiKey = process.env.FIRECRAWL_API_KEY
            let results: Array<{ title: string; snippet: string; url: string }> = []
            let error: string | undefined
            if (!apiKey) {
              error = "Firecrawl not configured on server"
            } else {
              try {
                const response = await fetch(`${FIRECRAWL_BASE}/search`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ query, limit: numResults, sources: [{ type: "web" }] }),
                  signal: AbortSignal.timeout(30000),
                })
                const data: any = await response.json()
                if (!response.ok) {
                  error = data?.error || `Firecrawl search failed (${response.status})`
                } else {
                  const webResults = Array.isArray(data?.data?.web) ? data.data.web : []
                  const newsResults = Array.isArray(data?.data?.news) ? data.data.news : []
                  results = [...webResults, ...newsResults].slice(0, numResults).map((item: any) => ({
                    title: String(item.title ?? ""),
                    snippet: String(item.description ?? item.snippet ?? ""),
                    url: String(item.url ?? item.link ?? ""),
                  }))
                }
              } catch (e: any) {
                error = e?.message || "Firecrawl search failed"
              }
            }
            toolResult = error ? JSON.stringify({ error }) : JSON.stringify({ results })
            toolEvents.push({
              slug: fnName,
              toolkit: "firecrawl",
              app: "Web Search",
              status: error ? "error" : "success",
              summary: error
                ? error
                : results.length > 0
                  ? `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`
                  : "No search results found",
              arguments: fnArgs,
            })
          } else if (fnName === "open_app") {
            const app = typeof fnArgs.app === "string" ? fnArgs.app.trim() : ""
            const url = typeof fnArgs.url === "string" ? fnArgs.url.trim() : ""
            try {
              const outcome = await openLocalTarget(app, url)
              toolResult = JSON.stringify(outcome)
              toolEvents.push({
                slug: "open_app",
                toolkit: "local",
                app: app || url || "Browser",
                status: outcome.error ? "error" : "success",
                summary: outcome.error ? outcome.error : outcome.message ?? "Done",
                arguments: fnArgs,
              })
            } catch (err: any) {
              toolResult = JSON.stringify({ error: err.message || "Failed to open" })
              toolEvents.push({
                slug: "open_app",
                toolkit: "local",
                app: app || url || "Browser",
                status: "error",
                summary: err.message || "Failed to open",
                arguments: fnArgs,
              })
            }
          } else if (fnName === "system_control") {
            const action = typeof fnArgs.action === "string" ? fnArgs.action.trim() : ""
            const app = typeof fnArgs.app === "string" ? fnArgs.app.trim() : ""
            try {
              const outcome = await runSystemControl(action, app)
              toolResult = JSON.stringify(outcome)
              toolEvents.push({
                slug: "system_control",
                toolkit: "local",
                app: app || action || "System",
                status: outcome.error ? "error" : "success",
                summary: outcome.error ? outcome.error : outcome.message ?? "Done",
                arguments: fnArgs,
              })
            } catch (err: any) {
              toolResult = JSON.stringify({ error: err.message || "System control failed" })
              toolEvents.push({
                slug: "system_control",
                toolkit: "local",
                app: app || action || "System",
                status: "error",
                summary: err.message || "System control failed",
                arguments: fnArgs,
              })
            }
          } else if (composio && fnName) {
            const tool = composioTools.find((t: any) => t.slug === fnName)
            const conn = composioConnected.find((c) => c.slug === tool?.toolkit?.slug)

            // Finalizing actions (send, post, create, update, ...) are deferred
            // until the user explicitly confirms. We store the prepared action
            // in the session and emit a "pending" event so the app still shows
            // the pre-filled compose panel.
            if (isFinalizeAction(fnName) && !confirmed) {
              session.pendingAction = {
                slug: fnName,
                args: fnArgs,
                toolkit: tool?.toolkit?.slug ?? null,
                app: conn?.name ?? tool?.toolkit?.name ?? fnName,
              }
              toolResult = JSON.stringify({
                deferred: true,
                note: `Prepared ${fnName}${Object.keys(fnArgs).length > 0 ? " with " + Object.entries(fnArgs).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(", ") : ""} — awaiting your confirmation.`,
              })
              toolEvents.push({
                slug: fnName,
                toolkit: tool?.toolkit?.slug ?? null,
                app: conn?.name ?? tool?.toolkit?.name ?? fnName,
                status: "pending",
                summary: "Ready — awaiting your confirmation",
                arguments: fnArgs,
              })
            } else {
              // Confirmed finalize: reuse the stored args as a fallback so a
              // bare "yes" still executes with the originally prepared values.
              const storedPending = session.pendingAction
              if (isFinalizeAction(fnName) && storedPending && storedPending.slug === fnName) {
                fnArgs = { ...storedPending.args, ...fnArgs }
                session.pendingAction = null
              }
              try {
                const execRes = await composio.tools.execute(fnName, {
                  connectedAccountId: conn?.accountId,
                  userId: sessionUserId,
                  arguments: fnArgs,
                  dangerouslySkipVersionCheck: true,
                })
                toolResult = JSON.stringify({
                  data: execRes?.data ?? null,
                  error: execRes?.error ?? null,
                  successful: execRes?.successful ?? false,
                })
                toolEvents.push({
                  slug: fnName,
                  toolkit: tool?.toolkit?.slug ?? null,
                  app: conn?.name ?? tool?.toolkit?.name ?? fnName,
                  status: execRes?.successful ? "success" : "error",
                  summary: summarizeToolEvent(execRes?.data, execRes?.error, execRes?.successful),
                  arguments: fnArgs,
                })
                // A successful draft/prepare action records the follow-up
                // finalizing action, so a later "yes" can send it.
                const finalizeSlug = finalizeSlugFor(fnName)
                if (execRes?.successful && finalizeSlug !== fnName && isFinalizeAction(finalizeSlug)) {
                  session.pendingAction = {
                    slug: finalizeSlug,
                    args: fnArgs,
                    toolkit: tool?.toolkit?.slug ?? null,
                    app: conn?.name ?? tool?.toolkit?.name ?? fnName,
                  }
                }
              } catch (err: any) {
                toolResult = JSON.stringify({ error: err.message || "Composio tool failed" })
                toolEvents.push({
                  slug: fnName,
                  toolkit: tool?.toolkit?.slug ?? null,
                  app: conn?.name ?? tool?.toolkit?.name ?? fnName,
                  status: "error",
                  summary: err.message || "Composio tool failed",
                  arguments: fnArgs,
                })
              }
            }
          } else {
            toolResult = JSON.stringify({ error: `Unknown tool: ${fnName}` })
            toolEvents.push({
              slug: fnName ?? "unknown",
              toolkit: null,
              app: null,
              status: "error",
              summary: `Unknown tool: ${fnName}`,
              arguments: fnArgs,
            })
          }

          // Format the result for the follow-up prompt
          let formatted = ""
          try {
            const parsed = JSON.parse(toolResult)
            if (parsed.deferred) {
              formatted = parsed.note || "Action prepared — awaiting your confirmation."
            } else if (parsed.error) {
              formatted = `Error: ${parsed.error}`
            } else if (Array.isArray(parsed.results)) {
              formatted = parsed.results.length > 0
                ? parsed.results
                    .map((r: any) => `- ${r.title}: ${r.snippet || "(no snippet)"} [Source: ${r.url}]`)
                    .join("\n")
                : "No search results found."
            } else if (parsed.message) {
              formatted = parsed.message
            } else if (parsed.data !== undefined && parsed.data !== null) {
              formatted = typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data)
            } else {
              formatted = toolResult
            }
          } catch {
            formatted = toolResult
          }

          toolResults.push({ name: fnName ?? "unknown", text: formatted })
        }

        // A confirmed "yes" with no new tool call executes the previously
        // prepared action deterministically, so the LLM doesn't have to re-call it.
        if (toolResults.length === 0 && confirmed && session.pendingAction && composio) {
          const pending = session.pendingAction
          session.pendingAction = null
          const tool = composioTools.find((t: any) => t.slug === pending.slug)
          const conn = composioConnected.find((c) => c.slug === pending.toolkit)
          try {
            const execRes = await composio.tools.execute(pending.slug, {
              connectedAccountId: conn?.accountId,
              userId: sessionUserId,
              arguments: pending.args,
              dangerouslySkipVersionCheck: true,
            })
            const text = JSON.stringify({
              data: execRes?.data ?? null,
              error: execRes?.error ?? null,
              successful: execRes?.successful ?? false,
            })
            let formatted = ""
            try {
              const parsed = JSON.parse(text)
              formatted = parsed.error
                ? `Error: ${parsed.error}`
                : parsed.data !== undefined && parsed.data !== null
                  ? typeof parsed.data === "string"
                    ? parsed.data
                    : JSON.stringify(parsed.data)
                  : text
            } catch {
              formatted = text
            }
            toolResults.push({ name: pending.slug, text: formatted })
            toolEvents.push({
              slug: pending.slug,
              toolkit: pending.toolkit,
              app: pending.app,
              status: execRes?.successful ? "success" : "error",
              summary: summarizeToolEvent(execRes?.data, execRes?.error, execRes?.successful),
              arguments: pending.args,
            })
          } catch (err: any) {
            toolResults.push({ name: pending.slug, text: `Error: ${err.message || "Composio tool failed"}` })
            toolEvents.push({
              slug: pending.slug,
              toolkit: pending.toolkit,
              app: pending.app,
              status: "error",
              summary: err.message || "Composio tool failed",
              arguments: pending.args,
            })
          }
        }

        // --- Second LLM call: inject tool results as context ---
        // deepseek-v4-flash doesn't fully support the tool round-trip,
        // so we inject results directly and ask for a summary.
        const toolSummary = toolResults.map((r) => `--- ${r.name} ---\n${r.text}`).join("\n\n")

        const followUpMessages = [
          ...apiMessages,
          {
            role: "user" as const,
            content: `I ran the tool(s) and got these results:\n\n${toolSummary}\n\nBased on these results, answer the user's original question concisely in 2-3 sentences. Cite sources when relevant. If any tool is awaiting confirmation, tell the user it is ready and ask whether they want to proceed.`,
          },
        ]

        const followUp = await fetch("https://api.concentrate.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: followUpMessages,
            max_tokens: 4096,
            temperature: 0.7,
            stream: false,
          }),
          signal: AbortSignal.timeout(90_000),
        })

        if (followUp.ok) {
          const followData: any = await followUp.json()
          const finalReply = followData.choices?.[0]?.message?.content ?? assistantMessage.content ?? ""
          res.json({ reply: finalReply, searched: true, tools: toolEvents })
          return
        }
      }

      // No tool calls — return the direct reply
      const reply = assistantMessage?.content ?? ""
      res.json({ reply })
      return
    }

    if (provider === "openrouter") {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) { res.status(500).json({ error: "OpenRouter not configured" }); return }

      const model = modelParam || "deepseek/deepseek-chat"

      const apiMessages = nonSystemMessages.map((m: any) => ({
        role: m.role,
        content: m.content !== null && m.content !== undefined ? String(m.content) : "",
      }))
      if (system && apiMessages.length > 0) {
        apiMessages.unshift({ role: "system", content: system })
      }

      const body: any = {
        model,
        messages: apiMessages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: false,
      }
      if (toolDefs) body.tools = toolDefs

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errBody = await response.text()
        res.status(502).json({ error: `OpenRouter error: ${response.status}`, detail: errBody })
        return
      }

      const data: any = await response.json()
      const reply = data.choices?.[0]?.message?.content ?? ""
      res.json({ reply })
      return
    }

    res.status(400).json({ error: `Unsupported provider: ${provider}` })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
