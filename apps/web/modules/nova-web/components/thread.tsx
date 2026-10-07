"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronDown,
  MoreHorizontal,
  PanelRight,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Composer } from "@/modules/nova-web/components/composer"
import {
  ApprovalCard,
  StreamingBubble,
  TimelineItem,
  WorkedFor,
} from "@/modules/nova-web/components/timeline"
import type {
  HarnessProvider,
  NovaAgentMode,
  NovaEffort,
} from "@/modules/nova-web/models"
import {
  sessionUiLabel,
  sessionUiStatus,
  type ApprovalRequest,
  type SessionDetail,
  type TimelineEntry,
} from "@/modules/nova-web/types"
import type { NovaReference } from "@/modules/nova/references/contracts"

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
}

export function ThreadView({
  session,
  timeline,
  approvals,
  draft,
  references,
  onReferencesChange,
  streamingText,
  streamPhase,
  streaming,
  workingSince,
  loading,
  decidingApprovalId,
  detailsOpen,
  model,
  provider,
  effort,
  mode,
  onDraftChange,
  onModelChange,
  onEffortChange,
  onModeChange,
  onSubmit,
  onRefresh,
  onToggleDetails,
  onDecision,
}: {
  session: SessionDetail
  timeline: TimelineEntry[]
  approvals: ApprovalRequest[]
  draft: string
  references: NovaReference[]
  onReferencesChange: (references: NovaReference[]) => void
  streamingText: string
  streamPhase: string | null
  streaming: boolean
  workingSince: number | null
  loading: boolean
  decidingApprovalId: string | null
  detailsOpen: boolean
  model: string
  provider: HarnessProvider
  effort: NovaEffort
  mode: NovaAgentMode
  onDraftChange: (value: string) => void
  onModelChange: (selection: { provider: HarnessProvider; model: string }) => void
  onEffortChange: (effort: NovaEffort) => void
  onModeChange: (mode: NovaAgentMode) => void
  onSubmit: () => void
  onRefresh: () => void
  onToggleDetails: () => void
  onDecision: (approval: ApprovalRequest, decision: "approved" | "denied") => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(() => Date.now())
  const [showJump, setShowJump] = useState(false)

  const sessionApprovals = approvals.filter(
    (approval) => approval.sessionId === session.id && approval.status === "pending",
  )
  const uiStatus = streaming ? "working" : sessionUiStatus(session)

  useEffect(() => {
    if (!workingSince && !streaming) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [streaming, workingSince])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth", block: "end" })
  }, [timeline.length, streamingText, streaming, sessionApprovals.length])

  const visibleTimeline = useMemo(() => {
    return timeline.filter((entry) => {
      if (entry.kind === "activity" && entry.type === "acknowledgement" && entry.status === "working") {
        return false
      }
      return true
    })
  }, [timeline])

  const workedSeconds = workingSince
    ? Math.max(1, Math.floor((now - workingSince) / 1000))
    : null

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowJump(distance > 180)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Capy-like thin header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.05] px-4">
        <span
          className={cn(
            "size-2 rounded-full",
            uiStatus === "working" || uiStatus === "idle" ? "bg-emerald-400" : "bg-[#3d3d3d]",
          )}
        />
        <h1 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#e8e8e8]">
          {session.objective}
        </h1>
        {streaming && workedSeconds != null ? (
          <span className="hidden text-[11px] text-[#6b6b6b] sm:inline">
            Working · {formatDuration(workedSeconds * 1000)}
          </span>
        ) : (
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.08em] text-[#3d3d3d] sm:inline">
            {sessionUiLabel(uiStatus)}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/settings?section=usage"
          }}
          className="rounded-md px-2 py-1 text-[12px] text-[#8a8a8a] transition hover:bg-white/[0.04] hover:text-[#c8c8c8]"
          title="Usage"
        >
          Usage
        </button>
        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition",
            detailsOpen
              ? "bg-white/[0.06] text-[#e8e8e8]"
              : "text-[#5c5c5c] hover:bg-white/[0.04] hover:text-[#a0a0a0]",
          )}
          aria-label="Toggle details"
        >
          <PanelRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="flex size-7 items-center justify-center rounded-md text-[#5c5c5c] transition hover:bg-white/[0.04] hover:text-[#a0a0a0]"
          aria-label="More"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[720px] px-5 py-8 sm:px-8">
            {sessionApprovals.map((approval) => (
              <div key={approval.id} className="mb-4">
                <ApprovalCard
                  approval={approval}
                  deciding={decidingApprovalId === approval.id}
                  onDecision={onDecision}
                />
              </div>
            ))}

            {visibleTimeline.length > 0 || streaming ? (
              <>
                {visibleTimeline.map((entry, index) => {
                  const prev = visibleTimeline[index - 1]
                  const showWorked =
                    entry.kind === "activity"
                    && entry.type === "response"
                    && prev?.kind === "message"
                    && prev.role === "user"
                  return (
                    <div key={`${entry.kind}-${entry.id}`}>
                      {showWorked ? <WorkedFor seconds={8} /> : null}
                      <TimelineItem entry={entry} />
                    </div>
                  )
                })}
                {streaming ? (
                  <>
                    {workedSeconds != null && workedSeconds > 2 && !streamingText ? (
                      <p className="my-3 text-[12.5px] text-[#6b6b6b]">
                        Worked for {formatDuration(workedSeconds * 1000)}
                      </p>
                    ) : null}
                    <StreamingBubble text={streamingText} phase={streamPhase} />
                  </>
                ) : null}
              </>
            ) : (
              <div className="py-16 text-center text-[13px] text-[#4a4a4a]">
                Send a message to start this thread.
              </div>
            )}
            <div ref={bottomRef} className="h-6" />
          </div>
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#1a1a1a]/95 px-3 py-1.5 text-[12px] text-[#a0a0a0] shadow-lg backdrop-blur transition hover:text-white"
          >
            <ChevronDown className="size-3.5" />
            Jump to latest
          </button>
        ) : null}

        {detailsOpen ? (
          <aside className="hidden w-[260px] shrink-0 border-l border-white/[0.05] bg-[#0e0e0e] lg:block">
            <div className="h-full overflow-y-auto p-4">
              <p className="text-[12px] font-medium text-[#c8c8c8]">Thread</p>
              <div className="mt-4 space-y-4 text-[12px] text-[#8a8a8a]">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#3d3d3d]">Status</p>
                  <p className="mt-1 capitalize text-[#c8c8c8]">{sessionUiLabel(uiStatus)}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#3d3d3d]">Harness</p>
                  <p className="mt-1 text-[#c8c8c8]">{provider} · {model}</p>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#3d3d3d]">Surfaces</p>
                  <div className="mt-1.5 space-y-1">
                    {session.surfaces.map((surface) => (
                      <p key={surface.id} className="capitalize text-[#a0a0a0]">
                        {surface.provider}
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#3d3d3d]">Runs</p>
                  <div className="mt-1.5 space-y-1">
                    {session.runs.length > 0 ? (
                      session.runs.slice(0, 5).map((run) => (
                        <p key={run.id} className="capitalize text-[#a0a0a0]">
                          {run.status.replaceAll("_", " ")}
                        </p>
                      ))
                    ) : (
                      <p className="text-[#3d3d3d]">No runs yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-2 sm:px-6">
        <div className="mx-auto max-w-[720px]">
          <Composer
            value={draft}
          onChange={onDraftChange}
          references={references}
          onReferencesChange={onReferencesChange}
            onSubmit={onSubmit}
            streaming={streaming}
            disabled={loading}
            model={model}
            provider={provider}
            effort={effort}
            mode={mode}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
            onModeChange={onModeChange}
            placeholder="Message Nova…"
          />
        </div>
      </div>
    </div>
  )
}
