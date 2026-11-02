const NOVA_ORIGINS = new Map([
  ["nova.supercodeai.tech", "https://nova.supercodeai.tech"],
  ["nova.localhost:3000", "http://nova.localhost:3000"],
  ["nova.localhost:3003", "http://nova.localhost:3003"],
])

export function getNovaLoginRedirectUrl(request: Request): URL | null {
  // Next.js can expose its internal localhost origin in request.url even when
  // the browser requested Nova's public host. Match the routing proxy's host.
  const host = (
    request.headers.get("x-forwarded-host")?.split(",")[0]
    ?? request.headers.get("host")
    ?? new URL(request.url).host
  ).trim().toLowerCase()
  const origin = NOVA_ORIGINS.get(host)
  return origin ? new URL("/app", origin) : null
}
