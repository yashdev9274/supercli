import { verifyHttpBasic } from "eve/channels/auth"

export function authenticateRuntime(request: Request, env: Record<string, string | undefined> = process.env) {
  if (env.NOVA_EVE_ENABLED !== "true" || !env.NOVA_EVE_SERVICE_PASSWORD) return null
  const result = verifyHttpBasic(request.headers.get("authorization"), {
    username: "nova-runtime",
    password: env.NOVA_EVE_SERVICE_PASSWORD,
  })
  return result.ok ? result.sessionAuth : null
}
