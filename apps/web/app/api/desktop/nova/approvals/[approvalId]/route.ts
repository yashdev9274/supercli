import { NextRequest, NextResponse } from "next/server"
import { approvalDecisionInputSchema } from "@super/nova"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import {
  ApprovalServiceError,
  decideApproval,
} from "@/modules/nova/approvals/service"

function errorStatus(error: ApprovalServiceError): number {
  switch (error.code) {
    case "not_found": return 404
    case "forbidden": return 403
    case "conflict":
    case "expired": return 409
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ approvalId: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }
    const parsed = approvalDecisionInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid approval decision", issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const { approvalId } = await context.params
    const approval = await decideApproval({
      userId: user.id,
      approvalId,
      decision: parsed.data,
    })
    return NextResponse.json({ approval })
  } catch (error) {
    if (error instanceof ApprovalServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: errorStatus(error) },
      )
    }
    console.error("[api/desktop/nova/approvals/:approvalId]", error)
    return NextResponse.json({ error: "Failed to decide Nova approval" }, { status: 500 })
  }
}
