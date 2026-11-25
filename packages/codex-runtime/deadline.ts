export function inferenceDeadline(parent?: AbortSignal, options: { idleMs?: number; totalMs?: number } = {}) {
  const controller = new AbortController()
  const idleMs = options.idleMs ?? 180_000
  const totalMs = options.totalMs ?? 360_000
  let idle: ReturnType<typeof setTimeout>
  const activity = () => {
    clearTimeout(idle)
    if (!controller.signal.aborted) idle = setTimeout(() => controller.abort(new DOMException("Codex stopped sending data for 180 seconds. Retry or check provider availability.", "TimeoutError")), idleMs)
  }
  const total = setTimeout(() => controller.abort(new DOMException("Codex exceeded the response time budget. Reduce reasoning effort or split the request.", "TimeoutError")), totalMs)
  activity()
  return {
    signal: AbortSignal.any([controller.signal, ...(parent ? [parent] : [])]),
    activity,
    dispose() { clearTimeout(idle); clearTimeout(total) },
  }
}
