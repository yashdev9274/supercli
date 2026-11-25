import type { SessionStreamEvent } from "eve/client"

type Principal = { principalId: string; principalType: string; issuer?: string }
type ReadSession = (id: string, signal: AbortSignal) => AsyncIterable<SessionStreamEvent>

export async function authorizeEveRequest(request: Request, principal: Principal, read?: ReadSession): Promise<boolean> {
  const path = new URL(request.url).pathname
  if (path === "/eve/v1/session") return request.method === "POST"
  const match = /^\/eve\/v1\/session\/([A-Za-z0-9_-]{1,256})(?:\/|$)/.exec(path)
  if (!match) return false
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(5000)])
  try {
    const source = read ? read(match[1], signal) : (await import("eve/server")).sessions.attach(match[1]).stream({ startIndex: 0, follow: true, signal })
    let count = 0
    for await (const event of source) {
      if (++count > 20 || event.meta.position.line > 0) return false
      if (event.type === "delivery.admitted") {
        const owner = event.data.principal
        return owner?.id === principal.principalId && owner.type === principal.principalType && owner.issuer === principal.issuer
      }
    }
  } catch {
    return false
  }
  return false
}
