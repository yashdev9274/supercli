"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { use, useEffect, useMemo, useRef, useState } from "react"
import {
  getPrDiffFiles,
  getReview,
  queueReview,
} from "@/modules/dashboard/actions"
import {
  PrWorkspace,
  type PrTab,
} from "@/modules/pull-requests/components/pr-workspace"
import { toast } from "sonner"

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

export default function ReviewDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const rawParams = use(props.params)
  const id = useMemo(() => {
    try {
      return decodeURIComponent(rawParams.id)
    } catch {
      return rawParams.id
    }
  }, [rawParams.id])

  const queryClient = useQueryClient()
  const autoQueuedRef = useRef(false)
  const [tab, setTab] = useState<PrTab>("Overview")

  const { data: review, isLoading } = useQuery({
    queryKey: ["review", id],
    queryFn: () => getReview(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" ? 4000 : false
    },
  })

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["pr-diff", id],
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
        queryClient.invalidateQueries({ queryKey: ["review", id] }),
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
      ])
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to queue review",
      )
    },
  })

  // Auto-queue when opening an unreviewed open PR (once per page mount).
  useEffect(() => {
    if (isLoading || !review || autoQueuedRef.current) return
    if (review.prState && review.prState !== "open") return
    if (hasCompletedReview(review)) return
    if (review.status === "pending" || review.status === "failed") return
    if (review.status !== "unreviewed" && review.review?.trim()) return

    autoQueuedRef.current = true
    queueMutation.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once when review first loads
  }, [isLoading, review?.status, review?.prState, review?.review])

  const stalePending = isStalePending(review)
  const isGenerating =
    queueMutation.isPending || (review?.status === "pending" && !stalePending)
  const completed = hasCompletedReview(review)
  const showGenerate =
    !!review &&
    !completed &&
    !isGenerating &&
    (review.status === "unreviewed" ||
      review.status === "failed" ||
      stalePending ||
      !review.review?.trim())

  if (!isLoading && !review) {
    return (
      <div className="flex h-full min-h-[calc(100vh-3.5rem)] flex-1 items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Pull request not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-1 flex-col overflow-hidden">
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
  )
}
