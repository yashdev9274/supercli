import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { routineError } from "./service"
export async function routineUser() { const session = await auth.api.getSession({ headers: await headers() }); if (!session) throw routineError("Unauthorized", 401); return session.user.id }
export function routineFailure(error: unknown) {
  console.error("[nova:routines] request failed", error)
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid routine" }, { status: 400 })
  if (error instanceof Error && "statusCode" in error) return NextResponse.json({ error: error.message }, { status: (error as any).statusCode })
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : ""
  if (code === "P2021" || code === "P2022") return NextResponse.json({ error: "Routine storage is not available. Deploy the latest database migration." }, { status: 503 })
  if (code === "P2003") return NextResponse.json({ error: "The selected agent is no longer available." }, { status: 409 })
  return NextResponse.json({ error: "Routine request failed" }, { status: 500 })
}
