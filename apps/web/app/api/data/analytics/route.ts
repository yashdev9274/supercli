import { NextRequest, NextResponse } from "next/server"

const TERMINAL_SERVER =
  process.env.TERMINAL_SERVER_URL ||
  process.env.SUPERCODE_SERVER_URL ||
  "https://supercode-8w7e.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const res = await fetch(`${TERMINAL_SERVER}/api/data/analytics${url.search}`, {
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`analytics proxy: ${TERMINAL_SERVER} returned ${res.status}: ${text.slice(0, 200)}`)
      return NextResponse.json(
        { error: `Terminal server (${TERMINAL_SERVER}) returned ${res.status}` },
        { status: 502 },
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("analytics proxy error:", message)
    return NextResponse.json(
      { error: `Cannot reach terminal server at ${TERMINAL_SERVER}. Set TERMINAL_SERVER_URL in Vercel env vars.` },
      { status: 502 },
    )
  }
}
