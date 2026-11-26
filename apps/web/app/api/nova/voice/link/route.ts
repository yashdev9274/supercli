import { NextResponse } from "next/server"

import { terminalHarnessUrl } from "@/modules/nova/harness/client"
import { withHarnessComposio } from "@/modules/nova/harness/composio"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Open or read the voice link the Jarvis dynamic island joins.
 * The browser never sees the harness token; Nova holds it and proxies.
 */
export async function POST(request: Request) {
  return withHarnessComposio(request, async (token) => {
    const response = await fetch(`${terminalHarnessUrl()}/api/voice/link`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    return readLink(response)
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id") ?? ""
  const since = url.searchParams.get("since") ?? "0"
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid voice link" }, { status: 400 })
  }
  return withHarnessComposio(request, async (token) => {
    const response = await fetch(
      `${terminalHarnessUrl()}/api/voice/link/${id}?since=${encodeURIComponent(since)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    )
    return readLink(response)
  })
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid voice link" }, { status: 400 })
  }
  return withHarnessComposio(request, async (token) => {
    const response = await fetch(`${terminalHarnessUrl()}/api/voice/link/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    return readLink(response)
  })
}

async function readLink(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({ error: "Voice link unavailable" }))
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Voice link unavailable"
    const error = new Error(message) as Error & { statusCode?: number }
    error.statusCode = response.status
    throw error
  }
  return body
}
