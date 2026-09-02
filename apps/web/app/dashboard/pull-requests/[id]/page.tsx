"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { use, useEffect, useMemo, useRef, useState } from "react"
import {
  getPrDiffFiles,
  getReview,
  getReviews,
  queueReview,
} from "@/modules/dashboard/actions"
import {
  PrWorkspace,
  type PrTab,
} from "@/modules/pull-requests/components/pr-workspace"
import { toast } from "sonner"

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

  const repoFullName = review?.repository.fullName

  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", repoFullName ?? "all-detail"],
    queryFn: () => getReviews(repoFullName),
    enabled: Boolean(repoFullName) || !isLoading,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
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
    onSuccess: (result) => {
      toast.success(result.message || "AI review queued")
      queryClient.setQueryData(["review", id], (prev: unknown) =>
        prev && typeof prev === "object"
          ? { ...(prev as object), status: "pending" }
          : prev,
      )
      queryClient.invalidateQueries({ queryKey: ["review", id] })
      queryClient.invalidateQueries({ queryKey: ["reviews"] })
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

  const isGenerating =
    queueMutation.isPending || review?.status === "pending"
  const completed = hasCompletedReview(review)
  const showGenerate =
    !!review &&
    !completed &&
    !isGenerating &&
    (review.status === "unreviewed" ||
      review.status === "failed" ||
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
        reviews={reviews}
        reviewsLoading={reviewsLoading && !reviews.length}
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
