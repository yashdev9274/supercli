const PARALLEL_READ_TOOLS = new Set([
  "read_file",
  "search_files",
  "read_instructions",
  "url_fetch",
  "web_search",
  "exa_fetch",
  "exa_search",
  "firecrawl_scrape",
  "firecrawl_search",
  "firecrawl_map",
])

export const READ_TOOL_CONCURRENCY = 4

export async function executeToolBatch<T extends { toolName: string }, R>(
  calls: T[],
  execute: (call: T) => Promise<R>,
  commit: (call: T, result: R) => void,
  signal?: AbortSignal,
): Promise<void> {
  let start = 0
  while (start < calls.length) {
    signal?.throwIfAborted()
    let end = start + 1
    if (PARALLEL_READ_TOOLS.has(calls[start]!.toolName)) {
      while (end < calls.length && PARALLEL_READ_TOOLS.has(calls[end]!.toolName)) end++
    }
    const results: R[] = new Array(end - start)
    let next = start
    let failed = false
    const workers = Array.from({ length: Math.min(READ_TOOL_CONCURRENCY, end - start) }, async () => {
      try {
        while (next < end && !failed) {
          signal?.throwIfAborted()
          const index = next++
          results[index - start] = await execute(calls[index]!)
        }
      } catch (error) {
        failed = true
        throw error
      }
    })
    const outcomes = await Promise.allSettled(workers)
    const failure = outcomes.find((outcome) => outcome.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
    signal?.throwIfAborted()
    for (let index = start; index < end; index++) commit(calls[index]!, results[index - start]!)
    start = end
  }
}
