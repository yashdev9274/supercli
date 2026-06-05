import { getStoredToken } from "src/lib/token"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken()
  return {
    "Content-Type": "application/json",
    ...(token?.access_token
      ? { Authorization: `Bearer ${token.access_token}` }
      : {}),
  }
}

export type GetUserResult =
  | { ok: true; user: { id: string; name: string | null; email: string } }
  | { ok: false; reason: "unauthorized" | "unreachable" }

export async function getCurrentUser(): Promise<GetUserResult> {
  try {
    const headers = await getAuthHeaders()
    const res = await fetch(`${BASE_URL}/api/user/me`, { headers })
    if (!res.ok) return { ok: false, reason: "unauthorized" }
    const user = await res.json() as { id: string; name: string | null; email: string }
    return { ok: true, user }
  } catch {
    return { ok: false, reason: "unreachable" }
  }
}

export async function getOrCreateConversation(
  conversationId: string | null,
  mode = "chat",
): Promise<any> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: conversationId, mode }),
  })
  if (!res.ok) throw new Error("Failed to create conversation")
  return res.json() as Promise<{ id: string; name: string | null; email: string }>
}

export async function getMessages(conversationId: string): Promise<any[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    headers,
  })
  if (!res.ok) throw new Error("Failed to get messages")
  const messages = await res.json() as any[]
  return messages.map((msg: any) => ({
    ...msg,
    content: parseContent(msg.content),
  }))
}

export async function addMessage(
  conversationId: string,
  role: string,
  content: string | object,
): Promise<any> {
  const headers = await getAuthHeaders()
  const contentStr = typeof content === "string" ? content : JSON.stringify(content)
  const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ role, content: contentStr }),
  })
  if (!res.ok) throw new Error("Failed to save message")
  return res.json()
}

export async function updateConversationMode(conversationId: string, mode: string) {
  const headers = await getAuthHeaders()
  await fetch(`${BASE_URL}/api/conversations/${conversationId}/mode`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ mode }),
  })
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const headers = await getAuthHeaders()
  await fetch(`${BASE_URL}/api/conversations/${conversationId}/title`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title }),
  })
}

function parseContent(content: string) {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

export function formatMessagesForAI(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
  }))
}
