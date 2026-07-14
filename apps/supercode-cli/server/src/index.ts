import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth"
import cors from "cors"
import prisma from "./lib/prisma"
import { loadEnvOnce } from "./lib/load-env"
import { recordUsage } from "./lib/track-usage"
import { computeCost } from "./lib/pricing"
import { registerAnalyticsRoutes } from "./routes/analytics"
import { transcribeAudio } from "./voice/speech"
import { tmpdir } from "os"
import { join } from "path"
import { writeFileSync, unlinkSync } from "fs"
import { randomUUID } from "crypto"

function toolParams(fn: any): object {
  const raw = fn.inputSchema ?? fn.parameters
  if (!raw || (typeof raw === "object" && "_def" in raw)) {
    return { type: "object", properties: {} }
  }
  return raw
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
  "anthropic/claude-fable-5": 128000,
  "anthropic/claude-opus-4-7": 128000,
  "anthropic/claude-opus-4-8": 128000,
  "openai/gpt-5.5": 128000,
}
function getModelMaxTokens(model: string): number {
  const exact = MODEL_MAX_TOKENS[model]
  if (exact !== undefined) return exact
  for (const [key, value] of Object.entries(MODEL_MAX_TOKENS)) {
    if (model.includes(key) || key.includes(model)) return value
  }
  return 8192
}
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

app.use(express.json())

registerAnalyticsRoutes(app, prisma)

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

    const { messages, provider, model: modelParam, tools } = req.body
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Messages array is required" })
      return
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
        for await (const chunk of result.textStream) {
          res.write(JSON.stringify({ type: "text", content: chunk }) + "\n")
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
        })
        res.write(JSON.stringify({ type: "finish", reason: await result.finishReason, usage }) + "\n")
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
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(bodyObj),
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `OpenRouter API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const decoder = new TextDecoder()
        let buffer = ""
        let inputTokens = 0
        let outputTokens = 0
        let pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const jsonStr = trimmed.slice(6)
            if (jsonStr === "[DONE]") break
            try {
              const data = JSON.parse(jsonStr)
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                res.write(JSON.stringify({ type: "text", content: delta.content }) + "\n")
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index ?? 0
                  if (!pendingToolCalls[index]) {
                    pendingToolCalls[index] = { id: "", name: "", args: "" }
                  }
                  if (tc.id) pendingToolCalls[index].id = tc.id
                  if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
                  if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
                }
              }
              const finishReason = data.choices?.[0]?.finish_reason
              if (finishReason === "tool_calls") {
                for (const [, call] of Object.entries(pendingToolCalls)) {
                  if (call.name && call.args) {
                    try {
                      const parsed = JSON.parse(call.args)
                      res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: parsed, toolCallId: call.id }) + "\n")
                    } catch { /* skip malformed args */ }
                  }
                }
                pendingToolCalls = {}
              }
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0
                outputTokens = data.usage.completion_tokens ?? 0
              }
            } catch { /* skip malformed */ }
          }
        }
        recordUsage({
          provider: "openrouter", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - orStart,
        })
        res.write(JSON.stringify({
          type: "finish", reason: "stop",
          usage: { inputTokens, outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 }, outputTokens, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, totalTokens: inputTokens + outputTokens }
        }) + "\n")
        res.end()
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
        for await (const chunk of result.textStream) {
          res.write(JSON.stringify({ type: "text", content: chunk }) + "\n")
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
        })
        res.write(JSON.stringify({ type: "finish", reason: await result.finishReason, usage }) + "\n")
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
        const decoder = new TextDecoder()
        let buffer = ""
        let inputTokens = 0
        let outputTokens = 0
        let pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const jsonStr = trimmed.slice(6)
            if (jsonStr === "[DONE]") break
            try {
              const data = JSON.parse(jsonStr)
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                res.write(JSON.stringify({ type: "text", content: delta.content }) + "\n")
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index ?? 0
                  if (!pendingToolCalls[index]) {
                    pendingToolCalls[index] = { id: "", name: "", args: "" }
                  }
                  if (tc.id) pendingToolCalls[index].id = tc.id
                  if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
                  if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
                }
              }
              const finishReason = data.choices?.[0]?.finish_reason
              if (finishReason === "tool_calls") {
                for (const [, call] of Object.entries(pendingToolCalls)) {
                  if (call.name && call.args) {
                    try {
                      const parsed = JSON.parse(call.args)
                      res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: parsed, toolCallId: call.id }) + "\n")
                    } catch { /* skip malformed args */ }
                  }
                }
                pendingToolCalls = {}
              }
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0
                outputTokens = data.usage.completion_tokens ?? 0
              }
            } catch { /* skip malformed */ }
          }
        }
        recordUsage({
          provider: "nvidia", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - nvidiaStart,
        })
        res.write(JSON.stringify({
          type: "finish", reason: "stop",
          usage: { inputTokens, outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 }, outputTokens, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, totalTokens: inputTokens + outputTokens }
        }) + "\n")
        res.end()
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
        const decoder = new TextDecoder()
        let buffer = ""
        let inputTokens = 0
        let outputTokens = 0
        let pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const jsonStr = trimmed.slice(6)
            if (jsonStr === "[DONE]") break
            try {
              const data = JSON.parse(jsonStr)
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                res.write(JSON.stringify({ type: "text", content: delta.content }) + "\n")
              }
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const index = tc.index ?? 0
                  if (!pendingToolCalls[index]) {
                    pendingToolCalls[index] = { id: "", name: "", args: "" }
                  }
                  if (tc.id) pendingToolCalls[index].id = tc.id
                  if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
                  if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
                }
              }
              const finishReason = data.choices?.[0]?.finish_reason
              if (finishReason === "tool_calls") {
                for (const [, call] of Object.entries(pendingToolCalls)) {
                  if (call.name && call.args) {
                    try {
                      const parsed = JSON.parse(call.args)
                      res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: parsed, toolCallId: call.id }) + "\n")
                    } catch { /* skip malformed args */ }
                  }
                }
                pendingToolCalls = {}
              }
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0
                outputTokens = data.usage.completion_tokens ?? 0
              }
            } catch { /* skip malformed */ }
          }
        }
        recordUsage({
          provider: "mergedev", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - mdStart,
        })
        res.write(JSON.stringify({
          type: "finish", reason: "stop",
          usage: { inputTokens, outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 }, outputTokens, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, totalTokens: inputTokens + outputTokens }
        }) + "\n")
        res.end()
        break
      }
      case "concentrateai": {
        const { concentrateAiKey: forwardedKey } = req.body
        const apiKey = forwardedKey || process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "ConcentrateAI not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
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
        })
        if (!response.ok) {
          const errText = await response.text().catch(() => "unknown error")
          res.status(response.status).json({ error: `ConcentrateAI API ${response.status}: ${errText}` })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) { res.status(500).json({ error: "No response body" }); return }
        const decoder = new TextDecoder()
        let buffer = ""
        let inputTokens = 0
        let outputTokens = 0
        let fullContent = ""
        let sawToolCalls = false
        let pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data: ")) continue
            const jsonStr = trimmed.slice(6)
            if (jsonStr === "[DONE]") break
            try {
              const data = JSON.parse(jsonStr)
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                fullContent += delta.content
                res.write(JSON.stringify({ type: "text", content: delta.content }) + "\n")
              }
              if (delta?.tool_calls) {
                sawToolCalls = true
                for (const tc of delta.tool_calls) {
                  const index = tc.index ?? 0
                  if (!pendingToolCalls[index]) {
                    pendingToolCalls[index] = { id: "", name: "", args: "" }
                  }
                  if (tc.id) pendingToolCalls[index].id = tc.id
                  if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
                  if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
                }
              }
              const finishReason = data.choices?.[0]?.finish_reason
              if (finishReason === "tool_calls") {
                sawToolCalls = true
                for (const [, call] of Object.entries(pendingToolCalls)) {
                  if (call.name && call.args) {
                    try {
                      const parsed = JSON.parse(call.args)
                      res.write(JSON.stringify({ type: "tool-call", toolName: call.name, args: parsed, toolCallId: call.id }) + "\n")
                    } catch { /* skip malformed args */ }
                  }
                }
                pendingToolCalls = {}
              }
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0
                outputTokens = data.usage.completion_tokens ?? 0
              }
            } catch { /* skip malformed */ }
          }
        }

        // Fallback: if streaming returned no text and no tool calls,
        // retry as non-streaming (ConcentrateAI's upstream intermittently
        // drops content on streaming requests).
        if (!fullContent.trim() && !sawToolCalls) {
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
          })
          if (fbRes.ok) {
            const fbData: any = await fbRes.json()
            const fbContent = fbData?.choices?.[0]?.message?.content ?? ""
            if (fbContent) {
              res.write(JSON.stringify({ type: "text", content: fbContent }) + "\n")
            }
            inputTokens = fbData?.usage?.prompt_tokens ?? 0
            outputTokens = fbData?.usage?.completion_tokens ?? 0
          }
        }

        recordUsage({
          provider: "concentrateai", model: modelName,
          inputTokens, outputTokens, cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(modelName, inputTokens, outputTokens, 0),
          durationMs: Date.now() - caStart,
        })
        res.write(JSON.stringify({
          type: "finish", reason: "stop",
          usage: { inputTokens, outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 }, outputTokens, inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, totalTokens: inputTokens + outputTokens }
        }) + "\n")
        res.end()
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
      case "concentrateai": {
        const { concentrateAiKey: forwardedKey } = req.body
        const apiKey = forwardedKey || process.env.CONCENTRATEAI_API_KEY
        if (!apiKey) { res.status(500).json({ error: "ConcentrateAI not configured on server" }); return }
        const modelName = modelParam || "deepseek-v4-flash"
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
      default: {
        res.status(400).json({ error: `Provider ${provider} not supported for structured generation` })
      }
    }
  } catch (error) {
    const msg = String(error)
    if (msg.includes("insufficient balance") || msg.includes("402")) {
      res.status(402).json({ error: "MiniMax API: insufficient balance. Top up at https://platform.minimax.ai" })
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
