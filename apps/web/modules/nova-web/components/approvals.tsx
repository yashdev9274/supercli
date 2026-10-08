"use client"

import { ApprovalCard, NovaMark } from "@/modules/nova-web/components/timeline"
import type { ApprovalRequest } from "@/modules/nova-web/types"

export function ApprovalsView({
  approvals,
  decidingApprovalId,
  onDecision,
  onOpenSession,
}: {
  approvals: ApprovalRequest[]
  decidingApprovalId: string | null
  onDecision: (approval: ApprovalRequest, decision: "approved" | "denied") => void
  onOpenSession: (sessionId: string) => void
}) {
  const pending = approvals.filter((approval) => approval.status === "pending")

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <div className="flex items-center gap-3">
          <NovaMark />
          <div>
            <h1 className="text-[16px] font-medium text-[#e8e8e8]">Approvals</h1>
            <p className="text-[12px] text-[#5c5c5c]">
              {pending.length} pending · company mutations need an explicit decision
            </p>
          </div>
        </div>
        <div className="mt-8 space-y-3">
          {pending.map((approval) => (
            <div key={approval.id} className="space-y-2">
              <button
                type="button"
                onClick={() => onOpenSession(approval.sessionId)}
                className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#3d3d3d] transition hover:text-[#2dd4bf]"
              >
                Thread {approval.sessionId.slice(0, 10)} · run {approval.runId.slice(0, 8)}
              </button>
              <ApprovalCard
                approval={approval}
                deciding={decidingApprovalId === approval.id}
                onDecision={onDecision}
              />
            </div>
          ))}
          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.06] px-5 py-10 text-center text-[12px] text-[#3d3d3d]">
              No pending approvals.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
