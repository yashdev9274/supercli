import prisma from "../lib/prisma"

export class ChatService {
  async createConversation(userId: string, mode = "chat", title: string | null = null) {
    return prisma.conversation.create({
      data: {
        userId,
        mode,
        title: title || `New ${mode} conversation`,
      },
    })
  }

  async getOrCreateConversation(userId: string, conversationId: string | null = null, mode = "chat") {
    if (conversationId) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      })
      if (conversation) return conversation
    }
    return this.createConversation(userId, mode)
  }

  async addMessage(conversationId: string, role: string, content: string | object) {
    const contentStr = typeof content === "string" ? content : JSON.stringify(content)
    return prisma.message.create({
      data: { conversationId, role, content: contentStr },
    })
  }

  async getMessages(conversationId: string) {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    })
    return messages.map((msg) => ({
      ...msg,
      content: this.parseContent(msg.content),
    }))
  }

  async getUserConversations(userId: string) {
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    })
  }

  async deleteConversation(conversationId: string, userId: string) {
    return prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    })
  }

  async updateMode(conversationId: string, mode: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { mode },
    })
  }

  async updateTitle(conversationId: string, title: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    })
  }

  parseContent(content: string) {
    try {
      return JSON.parse(content)
    } catch {
      return content
    }
  }

  formatMessagesForAI(messages: { role: string; content: string }[]) {
    return messages.map((msg) => ({
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
    }))
  }
}
