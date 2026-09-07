import { getStoredToken } from "src/lib/token"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

export async function proxyToolCall(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: false; error: string } | { ok: true; data: any }> {
  const token = await getStoredToken()
  if (!token?.access_token) {
    return { ok: false, error: "Not authenticated. Run 'supercode login' first." }
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })
    const data = await res.json() as any
    if (!res.ok) {
      return { ok: false, error: data?.error || `Server proxy returned HTTP ${res.status}` }
    }
    return { ok: true, data }
  } catch (error: any) {
    return { ok: false, error: error.message || "Failed to reach server proxy" }
  }
}
