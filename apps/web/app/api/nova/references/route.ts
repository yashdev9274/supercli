import { auth } from "@super/auth/server"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { referenceKindSchema } from "@/modules/nova/references/contracts"
import { ReferenceServiceError, searchNovaReferences } from "@/modules/nova/references/service"

const querySchema = z.object({ kind: referenceKindSchema, q: z.string().max(200).default("") })

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = querySchema.safeParse({ kind: request.nextUrl.searchParams.get("kind"), q: request.nextUrl.searchParams.get("q") ?? "" })
  if (!parsed.success) return NextResponse.json({ error: "Invalid reference search" }, { status: 400 })
  try {
    return NextResponse.json(await searchNovaReferences(session.user.id, parsed.data.kind, parsed.data.q.trim()), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof ReferenceServiceError ? error.message : "Could not load references. Check your repository connection and try again." },
      { status: error instanceof ReferenceServiceError ? error.status : 502 },
    )
  }
}
