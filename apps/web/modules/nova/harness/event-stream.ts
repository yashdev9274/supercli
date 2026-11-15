export async function* multiplexEvents<T>(
  source: (emit: (event: T) => Promise<void>, signal: AbortSignal) => AsyncIterable<T>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  const cancellation = new AbortController()
  const activeSignal = AbortSignal.any([cancellation.signal, ...(signal ? [signal] : [])])
  const queue: T[] = []
  let wake: (() => void) | undefined
  const space = new Set<() => void>()
  let done = false
  let failure: unknown
  let failed = false
  let closed = false
  const emit = async (event: T) => {
    while (!closed && queue.length >= 64) await new Promise<void>((resolve) => { space.add(resolve) })
    if (closed) return
    queue.push(event)
    wake?.()
  }
  const producer = (async () => {
    try {
      for await (const event of source(emit, activeSignal)) await emit(event)
    } catch (error) {
      failed = true
      failure = error
    } finally {
      done = true
      wake?.()
    }
  })()
  try {
    while (!done || queue.length) {
      if (!queue.length) {
        await new Promise<void>((resolve) => { wake = resolve })
        continue
      }
      const event = queue.shift()!
      for (const resolve of space) resolve()
      space.clear()
      yield event
    }
    if (failed) throw failure
  } finally {
    closed = true
    cancellation.abort()
    for (const resolve of space) resolve()
    space.clear()
    await producer
  }
}
