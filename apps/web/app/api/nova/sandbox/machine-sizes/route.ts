import { auth } from "@super/auth/server"
import { headers } from "next/headers"

import { machineCapabilities } from "@/modules/nova/sandbox/machine-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  const responseHeaders = { "Cache-Control": "private, no-store" }
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401, headers: responseHeaders })
  return Response.json(machineCapabilities(), { headers: responseHeaders })
}
