import { canonicalSchemas, executeResearchSearch } from "@super/agent-runtime"
import { terminalHarnessUrl } from "./client"

export function webSearchHarnessTools() {
  return [canonicalSchemas.exa_search!, canonicalSchemas.firecrawl_search!, canonicalSchemas.contextdev_search!]
}

export async function executeWebSearch(args: Record<string, unknown>, options: { token?: string; signal?: AbortSignal; env?: Record<string, string | undefined>; fetch?: typeof fetch } = {}) {
  return executeResearchSearch(args, { ...options, env: options.env ?? process.env, proxyUrl: terminalHarnessUrl() })
}
