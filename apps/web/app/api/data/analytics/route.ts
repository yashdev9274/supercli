import { NextRequest, NextResponse } from "next/server"

const TERMINAL_SERVER = process.env.TERMINAL_SERVER_URL || "http://localhost:10000"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const res = await fetch(`${TERMINAL_SERVER}/api/data/analytics${url.search}`, {
      headers: { "Content-Type": "application/json" },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error("analytics proxy error:", err)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 502 })
  }
}
