import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { ZodError } from "zod"

import { automationError } from "./service"
import { readBoundedBody } from "./security"

export async function automationUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw automationError("Unauthorized", 401)
  return session.user.id
}

export async function automationBody(request: Request): Promise<unknown> {
  try { return JSON.parse(await readBoundedBody(request, 40_000)) } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error
    throw automationError("Invalid JSON", 400)
  }
}

export function automationFailure(error: unknown): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid automation", issues: error.issues }, { status: 400 })
  if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") return NextResponse.json({ error: error.message }, { status: error.statusCode })
  return NextResponse.json({ error: "Automation request failed. Check database setup and connections." }, { status: 500 })
}
