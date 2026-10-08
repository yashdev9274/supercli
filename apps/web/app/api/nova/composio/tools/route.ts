import { requestHarnessComposio, withHarnessComposio } from "@/modules/nova/harness/composio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withHarnessComposio(request, (token) => requestHarnessComposio("tools", token))
}
