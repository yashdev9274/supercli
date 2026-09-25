/**
 * Rough conversation token estimates (chars / 4).
 */
import type { ModelMessage } from "ai"
import { getMessages } from "src/lib/api-client.ts"

export function estimateContextTokens(messages: ModelMessage[]): number {
  try {
    return Math.ceil(JSON.stringify(messages).length / 4)
  } catch {
    return 0
  }
}

export async function loadContextTokens(conversationId: string): Promise<number> {
  try {
    const msgs = await getMessages(conversationId)
    return estimateContextTokens(msgs as unknown as ModelMessage[])
  } catch {
    return 0
  }
}
