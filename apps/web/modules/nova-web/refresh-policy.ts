export const ACTIVE_REFRESH_MS = 8_000
export const IDLE_REFRESH_MS = 60_000
export const CONNECTOR_FRESH_MS = 5 * 60_000
export const CATALOG_FRESH_MS = 5 * 60_000

/** One request per resource at a time; only successful refreshes become fresh. */
export function createRefreshGate(now = Date.now) {
  const running = new Map<string, Promise<void>>()
  const completed = new Map<string, number>()

  function refresh(key: string, task: () => Promise<void>, maxAge = 0, force = false): Promise<void> {
    const current = running.get(key)
    // A mutation must get a post-mutation snapshot, not just an older in-flight read.
    if (current) return force
      ? current.catch(() => undefined).then(() => refresh(key, task))
      : current
    const last = completed.get(key)
    if (!force && last !== undefined && now() - last < maxAge) return Promise.resolve()
    const request = Promise.resolve().then(task).then(() => {
      completed.set(key, now())
    }).finally(() => {
      running.delete(key)
    })
    running.set(key, request)
    return request
  }

  return refresh
}

type PollingEnvironment = {
  visible: () => boolean
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel: (timer: ReturnType<typeof setTimeout>) => void
  subscribe: (callback: () => void) => () => void
}

/** Schedule after completion, never while hidden; focus/visibility share one flight. */
export function startVisiblePolling(task: () => Promise<unknown>, interval: number, env: PollingEnvironment, immediate = false) {
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => {
    if (timer !== undefined) env.cancel(timer)
    timer = undefined
  }
  const schedule = () => {
    clear()
    if (!stopped && env.visible()) timer = env.schedule(() => { void tick() }, interval)
  }
  const tick = async () => {
    if (stopped || running || !env.visible()) return
    clear()
    running = true
    try { await task() } catch { /* Callers own error reporting; retry on the next tick. */ }
    finally {
      running = false
      schedule()
    }
  }
  const unsubscribe = env.subscribe(() => {
    clear()
    if (env.visible()) void tick()
  })
  if (immediate) void tick()
  else schedule()
  return () => {
    stopped = true
    clear()
    unsubscribe()
  }
}
