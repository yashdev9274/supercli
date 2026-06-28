import type { LanguageModel } from "ai"
import { agentService } from "src/agent/index.ts"
import type { GenerateResult } from "src/agent/agent.ts"

export interface CompactionResult {
  summary: string
  tokensBefore: number
  tokensAfter: number
  finishReason?: string
  error?: string
}

interface MessageLike {
  role: "user" | "assistant" | "system" | string
  content: string
  tokens?: number
}

/**
 * Compact a conversation by asking the `compaction` agent to produce a
 * compressed summary. The summary is suitable for replacing older messages
 * in the conversation history without losing critical context.
 *
 * Returns the summary text + token counts. Caller is responsible for
 * actually persisting the new messages.
 */
export async function compactConversation(
  model: LanguageModel,
  messages: MessageLike[],
  options: {
    previousSummary?: string
    keepRecent?: number
  } = {},
): Promise<CompactionResult> {
  const keepRecent = options.keepRecent ?? 4
  const recent = messages.slice(-keepRecent)
  const toCompress = messages.slice(0, -keepRecent)

  if (toCompress.length === 0) {
    return {
      summary: options.previousSummary ?? "",
      tokensBefore: messages.reduce((s, m) => s + (m.tokens ?? 0), 0),
      tokensAfter: 0,
      finishReason: "no-op",
    }
  }

  const compactionAgent = agentService.get("compaction")
  if (!compactionAgent) {
    return {
      summary: "",
      tokensBefore: 0,
      tokensAfter: 0,
      error: "compaction agent not registered",
    }
  }

  const conversationText = toCompress
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")

  const userPrompt = [
    options.previousSummary
      ? `<previous-summary>\n${options.previousSummary}\n</previous-summary>\n\n`
      : "",
    "Conversation to summarize:\n\n",
    conversationText,
    "\n\nProduce the updated summary now.",
  ].join("")

  let result: GenerateResult
  try {
    result = await compactionAgent.generate!({
      model,
      prompt: userPrompt,
      budget: 1,
    })
  } catch (error: any) {
    return {
      summary: "",
      tokensBefore: 0,
      tokensAfter: 0,
      error: error?.message ?? String(error),
    }
  }

  const tokensBefore = toCompress.reduce((s, m) => s + (m.tokens ?? 0), 0)
  const tokensAfter =
    (result.tokens?.input ?? 0) + (result.tokens?.output ?? 0) +
    recent.reduce((s, m) => s + (m.tokens ?? 0), 0)

  return {
    summary: result.text,
    tokensBefore,
    tokensAfter,
    finishReason: result.finishReason,
    error: result.error,
  }
}

/**
 * Generate a concise conversation title using the `title` agent.
 */
export async function generateTitle(
  model: LanguageModel,
  firstUserMessage: string,
): Promise<string> {
  const titleAgent = agentService.get("title")
  if (!titleAgent) return firstUserMessage.slice(0, 50)

  try {
    const result = await titleAgent.generate!({
      model,
      prompt: firstUserMessage,
      budget: 1,
    })
    return result.text.trim().split("\n")[0]?.slice(0, 50) ?? firstUserMessage.slice(0, 50)
  } catch {
    return firstUserMessage.slice(0, 50)
  }
}

/**
 * Generate a session handoff summary using the `summary` agent.
 */
export async function generateSessionSummary(
  model: LanguageModel,
  messages: MessageLike[],
): Promise<string> {
  const summaryAgent = agentService.get("summary")
  if (!summaryAgent) return ""

  const conversationText = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")

  try {
    const result = await summaryAgent.generate!({
      model,
      prompt: conversationText,
      budget: 1,
    })
    return result.text
  } catch {
    return ""
  }
}