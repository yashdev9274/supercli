import express from "express"
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth"
import cors from "cors"
import prisma from "@super/db-terminal"

const port = process.env.PORT || 10000
const serverUrl = process.env.BETTER_AUTH_URL || `http://localhost:${port}`
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000"
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
        res.write(JSON.stringify({ type: "finish", reason: await result.finishReason, usage }) + "\n")
        res.end()
        break
      }
      case "openrouter": {
        const apiKey = process.env.OPENROUTER_API_KEY
        if (!apiKey) { res.status(500).json({ error: "OpenRouter not configured on server" }); return }
        const modelName = modelParam || process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free"

        const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

        const apiMessages: any[] = []
        if (system) apiMessages.push({ role: "system", content: system })
        for (const m of nonSystemMessages) {
          apiMessages.push({ role: m.role, content: m.content as string })
        }

        const apiTools: any[] = []
        if (tools) {
          for (const key of Object.keys(tools)) {
            if (key === "web_search") {
              apiTools.push({ type: "openrouter:web_search" })
            } else if (key === "url_fetch") {
              apiTools.push({ type: "openrouter:web_fetch" })
            } else {
              const def = (tools as any)[key]
              const params = def.parameters
                ? (typeof def.parameters === "object" && "toJSON" in (def.parameters as any)
                  ? (def.parameters as any).toJSON()
                  : def.parameters)
                : undefined
              apiTools.push({
                type: "function",
                function: { name: key, description: def.description || "", parameters: params },
              })
            }
          }
        }

        const allMessages = [...apiMessages]
        const maxIter = 10

        for (let iter = 0; iter < maxIter; iter++) {
          const body: any = { model: modelName, messages: allMessages, stream: true }
          if (apiTools.length > 0) body.tools = apiTools
          if (modelName.includes("minimax-m3") || modelName.includes("glm-5.1")) body.max_tokens = 8192

          const orRes = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })

          if (!orRes.ok) {
            const errText = await orRes.text().catch(() => "unknown error")
            res.status(orRes.status).json({ error: `OpenRouter API ${orRes.status}: ${errText.slice(0, 500)}` })
            return
          }

          const reader = orRes.body?.getReader()
          if (!reader) { res.status(500).json({ error: "No response body" }); return }

          const decoder = new TextDecoder()
          let buffer = ""
          let toolCalls: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = []
          let finishReason = ""
          let hasContent = false

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
              if (jsonStr === "[DONE]") continue
              try {
                const data = JSON.parse(jsonStr)
                const delta = data.choices?.[0]?.delta
                const finish = data.choices?.[0]?.finish_reason
                if (finish) finishReason = finish
                if (delta?.content) {
                  hasContent = true
                  res.write(JSON.stringify({ type: "text", content: delta.content }) + "\n")
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const existing = toolCalls.find(t => t.id === tc.id)
                    if (existing) {
                      if (tc.function?.arguments) existing.function.arguments += tc.function.arguments
                    } else {
                      toolCalls.push({
                        id: tc.id,
                        type: tc.type || "function",
                        function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" },
                      })
                    }
                  }
                }
              } catch { /* skip */ }
            }
          }

          if (finishReason === "tool_calls" && toolCalls.length > 0) {
            const assistantMsg: any = { role: "assistant", content: null }
            assistantMsg.tool_calls = toolCalls.map(tc => ({
              id: tc.id, type: tc.type,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }))
            allMessages.push(assistantMsg)

            for (const tc of toolCalls) {
              const toolName = tc.function.name
              const toolDef = (tools as any)?.[toolName]
              const resultStr = toolDef
                ? `Tool "${toolName}" requires client-side execution` : `Tool "${toolName}" is not available`
              allMessages.push({ role: "tool", tool_call_id: tc.id, content: resultStr })
            }

            toolCalls = []
            finishReason = ""
            continue
          }

          if (!hasContent) {
            res.write(JSON.stringify({ type: "text", content: "" }) + "\n")
          }
          res.write(JSON.stringify({
            type: "finish", reason: "stop",
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          }) + "\n")
          res.end()
          break
        }
        break
      }
      case "minimax": {
        const apiKey = process.env.MINIMAX_API_KEY
        if (!apiKey) { res.status(500).json({ error: "MiniMax not configured on server" }); return }
        const modelName = modelParam || "MiniMax-M2"
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
        res.write(JSON.stringify({ type: "finish", reason: await result.finishReason, usage }) + "\n")
        res.end()
        break
      }
      case "nvidia": {
        const apiKey = process.env.NVIDIA_API_KEY
        if (!apiKey) { res.status(500).json({ error: "NVIDIA not configured on server" }); return }
        const modelName = modelParam || process.env.NVIDIA_MODEL || "minimaxai/minimax-m2.7"
        const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1"
        const bodyObj: any = {
          model: modelName,
          messages: nonSystemMessages.map((m: any) => ({ role: m.role, content: String(m.content) })),
          max_tokens: Number(process.env.NVIDIA_MAX_TOKENS) || 8192,
          temperature: Number(process.env.NVIDIA_TEMPERATURE) || 1,
          top_p: Number(process.env.NVIDIA_TOP_P) || 0.95,
          stream: true,
        }
        if (system && nonSystemMessages.length > 0) {
          bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
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
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0
                outputTokens = data.usage.completion_tokens ?? 0
              }
            } catch { /* skip malformed */ }
          }
        }
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
        const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")
        const openrouter = createOpenRouter({ apiKey })
        const modelName = modelParam || process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free"
        const result = await generateObject({ model: openrouter(modelName), schema: schema as any, prompt })
        res.json({ object: result.object })
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
