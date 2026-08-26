"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { use, useEffect, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  GitPullRequest,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileDiff,
  User,
  Sparkles,
  Loader2,
} from "lucide-react"
import { getReview, queueReview } from "@/modules/dashboard/actions"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const ease = [0.25, 0.1, 0.25, 1] as const

function timeAgo(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function ReviewStatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-500">
        <CheckCircle2 className="h-3 w-3" />
        Reviewed
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-amber-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Generating
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
      <GitPullRequest className="h-3 w-3" />
      Unreviewed
    </span>
  )
}

function PrStatePill({ state }: { state?: "open" | "closed" | "merged" }) {
  if (!state) return null
  const styles =
    state === "open"
      ? "text-emerald-500/90 bg-emerald-500/10 border-emerald-500/20"
      : state === "merged"
        ? "text-violet-400/90 bg-violet-500/10 border-violet-500/20"
        : "text-muted-foreground/70 bg-muted/30 border-border"
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        styles,
      )}
    >
      {state}
    </span>
  )
}

function hasCompletedReview(review: {
  status: string
  review?: string
} | null | undefined) {
  if (!review) return false
  if (review.status !== "completed") return false
  const text = review.review?.trim() ?? ""
  if (!text) return false
  // Placeholder bodies written before the worker finishes
  if (text === "Waiting for AI review worker…" || text === "Review queued.") return false
  return true
}

export default function ReviewDetailPage(props: { params: Promise<{ id: string }> }) {
  const rawParams = use(props.params)
  const id = useMemo(() => {
    try {
      return decodeURIComponent(rawParams.id)
    } catch {
      return rawParams.id
    }
  }, [rawParams.id])
  const router = useRouter()
  const queryClient = useQueryClient()
  const autoQueuedRef = useRef(false)

  const { data: review, isLoading } = useQuery({
    queryKey: ["review", id],
    queryFn: () => getReview(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "pending" ? 4000 : false
    },
  })

  const queueMutation = useMutation({
    mutationFn: () => queueReview(id),
    onSuccess: (result) => {
      toast.success(result.message || "AI review queued")
      // Optimistically reflect pending so polling starts immediately
      queryClient.setQueryData(["review", id], (prev: any) =>
        prev ? { ...prev, status: "pending" } : prev,
      )
      queryClient.invalidateQueries({ queryKey: ["review", id] })
      queryClient.invalidateQueries({ queryKey: ["reviews"] })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to queue review")
    },
  })

  // Auto-queue when opening an unreviewed open PR (once per page mount).
  // Do not auto-retry failures — user clicks Generate/Retry for those.
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

  return (
    <div className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease }}
        className="mb-8 flex items-start gap-4"
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/dashboard/pull-requests")}
          className="h-9 w-9 text-muted-foreground hover:text-foreground mt-0.5"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-muted/30 animate-pulse" />
              <div className="h-3 w-32 rounded bg-muted/20 animate-pulse" />
            </div>
          ) : review ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <GitPullRequest className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                    <h1 className="text-xl font-medium tracking-tight text-foreground truncate">
                      #{review.prNumber} {review.prTitle}
                    </h1>
                  </div>
                  <div className="flex items-center gap-3 mt-2 ml-8 flex-wrap">
                    <span className="text-xs text-muted-foreground/50 font-mono">
                      {review.repository.fullName}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {timeAgo(new Date(review.updatedAt ?? review.createdAt))}
                    </span>
                    <PrStatePill state={review.prState} />
                    <ReviewStatusBadge status={isGenerating && !completed ? "pending" : review.status} />
                    <a
                      href={review.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1"
                    >
                      View on GitHub <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {(showGenerate || isGenerating || completed) && (
                  <Button
                    size="sm"
                    variant={completed ? "outline" : "default"}
                    disabled={isGenerating}
                    onClick={() => queueMutation.mutate()}
                    className="shrink-0 gap-1.5"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        {completed ? "Regenerate review" : "Generate review"}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pull request not found.</p>
          )}
        </div>
      </motion.div>

      {/* Meta cards */}
      {review && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.05 }}
          className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase mb-1">
              Author
            </p>
            <p className="text-sm text-foreground flex items-center gap-1.5 truncate">
              <User className="h-3.5 w-3.5 text-muted-foreground/50" />
              {review.author ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase mb-1">
              Files
            </p>
            <p className="text-sm text-foreground flex items-center gap-1.5">
              <FileDiff className="h-3.5 w-3.5 text-muted-foreground/50" />
              {review.changedFiles ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase mb-1">
              Additions
            </p>
            <p className="text-sm text-emerald-500">
              {typeof review.additions === "number" ? `+${review.additions}` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
            <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase mb-1">
              Deletions
            </p>
            <p className="text-sm text-red-400">
              {typeof review.deletions === "number" ? `−${review.deletions}` : "—"}
            </p>
          </div>
        </motion.div>
      )}

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease, delay: 0.08 }}
        className="mb-6"
      >
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-4 rounded bg-muted/20 animate-pulse"
                style={{ width: `${85 - i * 12}%` }}
              />
            ))}
          </div>
        ) : review ? (
          <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="border-b border-border bg-muted/20 px-6 py-3">
              <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
                Summary
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-foreground/90 leading-relaxed">
                {completed
                  ? review.summary
                  : isGenerating
                    ? "Generating AI summary…"
                    : review.summary ||
                      review.body?.trim() ||
                      "No summary available for this pull request yet."}
              </p>
              {review.body && (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                    Show PR description
                  </summary>
                  <pre className="mt-3 text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">
                    {review.body}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ) : null}
      </motion.div>

      {/* Full AI Review */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease, delay: 0.12 }}
      >
        {isLoading ? null : review ? (
          <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            <div className="border-b border-border bg-muted/20 px-6 py-3 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
                AI Code Review
              </p>
              {!completed && (
                <span className="text-[11px] text-muted-foreground/50">
                  {isGenerating
                    ? "Review is running — this page refreshes automatically"
                    : review.status === "failed"
                      ? "Review failed — try generating again"
                      : "No AI review yet"}
                </span>
              )}
            </div>
            {completed ? (
              <pre className="px-6 py-5 text-sm text-foreground/90 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {review.review}
              </pre>
            ) : isGenerating ? (
              <div className="px-6 py-14 text-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">Generating AI code review…</p>
                <p className="text-xs text-muted-foreground/50 max-w-md mx-auto">
                  Fetching the diff, retrieving codebase context, and writing the summary.
                  This usually takes under a minute.
                </p>
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  {review.status === "failed"
                    ? review.review || "The last review attempt failed."
                    : "No AI review content yet."}
                </p>
                <Button
                  size="sm"
                  onClick={() => queueMutation.mutate()}
                  disabled={queueMutation.isPending}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {review.status === "failed" ? "Retry review" : "Generate review"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-muted/10 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">No review content available.</p>
          </div>
        )}
      </motion.div>
    </div>
  )
}
