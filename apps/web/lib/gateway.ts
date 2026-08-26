import { createOpenAI } from "@ai-sdk/openai"

/**
 * Merge Gateway via the AI SDK URL shim.
 * Must use `/v1/ai-sdk` (not bare `/v1`) so @ai-sdk/openai's Responses
 * payload shape is accepted. Bare `/v1/responses` expects Merge-native
 * `{ type: "message", role, content }` and returns 422 otherwise.
 * @see https://docs.merge.dev/merge-gateway/get-started
 */
export const gateway = createOpenAI({
  baseURL: "https://api-gateway.merge.dev/v1/ai-sdk",
  apiKey: process.env.MERGE_GATEWAY_API_KEY!,
})
