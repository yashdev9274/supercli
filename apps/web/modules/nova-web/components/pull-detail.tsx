"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  getPrDiffFiles,
  getReview,
  queueReview,
} from "@/modules/dashboard/actions"
import {
  PrWorkspace,
  type PrTab,
} from "@/modules/pull-requests/components/pr-workspace"

const STALE_PENDING_MS = 10 * 60 * 1000

function isStalePending(review: {
  status: string
  updatedAt?: Date | string
} | null | undefined) {
  if (review?.status !== "pending" || !review.updatedAt) return false
  return Date.now() - new Date(review.updatedAt).getTime() >= STALE_PENDING_MS
}

function hasCompletedReview(review: {
  status: string
  review?: string
} | null | undefined) {
  if (!review) return false
  if (review.status !== "completed") return false
  const text = review.review?.trim() ?? ""
  if (!text) return false
  if (text === "Waiting for AI review worker…" || text === "Review queued.") {
    return false
  }
  return true
}

export function PullDetailView({
  pullId,
  onBack,
}: {
  pullId: string
  onBack: () => void
}) {
  const id = useMemo(() => {
    try {
      return decodeURIComponent(pullId)
    } catch {
      return pullId
    }
  }, [pullId])

  const queryClient = useQueryClient()
  const autoQueuedRef = useRef(false)
  const [tab, setTab] = useState<PrTab>("Overview")

  const { data: review, isLoading } = useQuery({
    queryKey: ["nova-review", id],
    queryFn: () => getReview(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" ? 4000 : false
    },
  })

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["nova-pr-diff", id],
    queryFn: () => getPrDiffFiles(id),
    enabled: Boolean(review),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const queueMutation = useMutation({
    mutationFn: () => queueReview(id),
    onSuccess: async (result) => {
      toast.success(result.message || "AI review completed")
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["nova-review", id] }),
        queryClient.invalidateQueries({ queryKey: ["nova-reviews"] }),
      ])
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to queue review")
    },
  })

  useEffect(() => {
    if (isLoading || !review || autoQueuedRef.current) return
    if (review.prState && review.prState !== "open") return
    if (hasCompletedReview(review)) return
    if (review.status === "pending" || review.status === "failed") return
    if (review.status !== "unreviewed" && review.review?.trim()) return

    autoQueuedRef.current = true
    queueMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, review?.status, review?.prState, review?.review])

  const stalePending = isStalePending(review)
  const isGenerating =
    queueMutation.isPending || (review?.status === "pending" && !stalePending)
  const completed = hasCompletedReview(review)
  const showGenerate =
    !!review
    && !completed
    && !isGenerating
    && (
      review.status === "unreviewed"
      || review.status === "failed"
      || stalePending
      || !review.review?.trim()
    )

  if (!isLoading && !review) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0f0f0f] text-[13px] text-[#6b6b6b]">
        <p>Pull request not found.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-[#a0a0a0] hover:bg-white/[0.04]"
        >
          Back to pull requests
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0f0f0f]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-[#8a8a8a] transition hover:bg-white/[0.04] hover:text-[#e8e8e8]"
        >
          <ArrowLeft className="size-3.5" />
          Pulls
        </button>
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-[12px] text-[#6b6b6b]">
            <Loader2 className="size-3.5 animate-spin" />
            Loading review…
          </span>
        ) : (
          <span className="truncate text-[12px] text-[#a0a0a0]">
            {review?.repository.fullName}#{review?.prNumber}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PrWorkspace
          activeId={id}
          review={review}
          files={files}
          filesLoading={filesLoading}
          tab={tab}
          onTabChange={setTab}
          isGenerating={Boolean(isGenerating && !completed)}
          completed={completed}
          showGenerate={showGenerate}
          onGenerate={() => queueMutation.mutate()}
          generatePending={queueMutation.isPending}
        />
      </div>
    </div>
  )
}
