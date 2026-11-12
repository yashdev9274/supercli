import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { routineError } from "./service"
export async function routineUser() { const session = await auth.api.getSession({ headers: await headers() }); if (!session) throw routineError("Unauthorized", 401); return session.user.id }
export function routineFailure(error: unknown) { if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid routine" }, { status: 400 }); if (error instanceof Error && "statusCode" in error) return NextResponse.json({ error: error.message }, { status: (error as any).statusCode }); return NextResponse.json({ error: "Routine request failed" }, { status: 500 }) }
