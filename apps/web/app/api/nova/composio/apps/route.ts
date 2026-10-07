import { requestHarnessComposio, withHarnessComposio } from "@/modules/nova/harness/composio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withHarnessComposio(request, async (token) => {
    const [payload, mcp] = await Promise.all([
      requestHarnessComposio<{ apps: unknown[] }>("apps", token),
      requestHarnessComposio<{ url: string; sessionId: string; headers: Record<string, string> }>("session", token),
    ])
    return { apps: payload.apps, mcp: { url: mcp.url, sessionId: mcp.sessionId, hasHeaders: Object.keys(mcp.headers).length > 0 } }
  })
}
