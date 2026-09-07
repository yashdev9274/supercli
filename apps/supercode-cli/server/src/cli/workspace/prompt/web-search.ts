/** Web search requirement. */
export function webSearchSection(): string[] {
  return [
    "## Web Search Requirement",
    "",
    "When the user asks about a company, product, service, topic, or any information",
    "that may have changed since your training data, you MUST call the available",
    "web search tool (`firecrawl_search` or `exa_search`) to retrieve current",
    "information. Do NOT answer from your training data — always search first.",
    "If search returns an error, tell the user search is unavailable.",
    "Never fabricate search results.",
    "",
  ]
}
