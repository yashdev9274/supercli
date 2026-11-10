import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { agentError } from "./service"

export async function agentUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw agentError("Unauthorized", 401)
  return session.user.id
}

export async function agentBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await request.text())
  } catch {
    throw agentError("Invalid JSON", 400)
  }
}

export function agentFailure(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid agent", issues: error.issues }, { status: 400 })
  }
  if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") {
    return NextResponse.json({ error: error.message }, { status: error.statusCode })
  }
  return NextResponse.json({ error: "Agent request failed" }, { status: 500 })
}
