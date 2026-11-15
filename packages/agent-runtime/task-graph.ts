export const TASK_GRAPH_CONCURRENCY = 3

export type TaskNode<T> = {
  readOnly: boolean
  run: (signal: AbortSignal) => Promise<T>
}

export async function executeTaskGraph<T>(
  nodes: TaskNode<T>[],
  parallel = false,
  signal?: AbortSignal,
): Promise<T[]> {
  const cancellation = new AbortController()
  const activeSignal = signal ? AbortSignal.any([signal, cancellation.signal]) : cancellation.signal
  const results: T[] = new Array(nodes.length)
  let start = 0
  while (start < nodes.length) {
    activeSignal.throwIfAborted()
    let end = start + 1
    if (parallel && nodes[start]!.readOnly) {
      while (end < nodes.length && nodes[end]!.readOnly) end++
    }
    let next = start
    let failed = false
    let failure: unknown
    const workers = Array.from({ length: Math.min(TASK_GRAPH_CONCURRENCY, end - start) }, async () => {
      while (next < end && !failed) {
        try {
          activeSignal.throwIfAborted()
          const index = next++
          results[index] = await nodes[index]!.run(activeSignal)
        } catch (error) {
          if (!failed) {
            failed = true
            failure = error
            cancellation.abort(error)
          }
        }
      }
    })
    await Promise.all(workers)
    if (failed) throw failure
    activeSignal.throwIfAborted()
    start = end
  }
  return results
}
