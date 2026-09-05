import { env } from "../env"

/**
 * Exchange OAuth/SSO code for tokens (Vercel-initiated SSO → Redirect Login URL).
 * @see https://vercel.com/docs/integrations/create-integration/marketplace-api
 */
export async function exchangeSsoCode(code: string, state: string | null) {
  const res = await fetch("https://api.vercel.com/v1/integrations/sso/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code,
      state,
      client_id: env.INTEGRATION_CLIENT_ID,
      client_secret: env.INTEGRATION_CLIENT_SECRET,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`SSO token exchange failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<{
    access_token?: string
    id_token?: string
    token_type?: string
    installation_id?: string
    user_id?: string
    team_id?: string
  }>
}
