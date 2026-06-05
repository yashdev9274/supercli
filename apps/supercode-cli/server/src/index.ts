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
