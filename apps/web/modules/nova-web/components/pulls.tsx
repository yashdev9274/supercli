"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FolderGit2,
  GitPullRequest,
  Loader2,
  Search,
  SkipForward,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  getReviews,
  type ReviewItem,
} from "@/modules/dashboard/actions"
import { getConnectedRepos } from "@/modules/dashboard/actions/analytics"
import { NovaMark } from "@/modules/nova-web/components/timeline"

type ReviewStatus =
  | "completed"
  | "pending"
  | "failed"
  | "unreviewed"
  | "skipped"
  | "trial_ended"

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
        <CheckCircle2 className="size-3.5" />
        Reviewed
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400">
        <Loader2 className="size-3.5 animate-spin" />
        Reviewing
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-red-400">
        <AlertTriangle className="size-3.5" />
        Failed
      </span>
    )
  }
  if (status === "skipped" || status === "trial_ended") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#85858e]">
        <SkipForward className="size-3.5" />
        Skipped
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#8a8a8a]">
      <GitPullRequest className="size-3.5" />
      Unreviewed
    </span>
  )
}

function prStateChip(state?: ReviewItem["prState"]) {
  if (state === "merged") return "bg-violet-500/15 text-violet-300"
  if (state === "closed") return "bg-red-500/10 text-red-300"
  return "bg-emerald-500/10 text-emerald-300"
}

export function PullsView({
  onOpenPull,
}: {
  onOpenPull: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const [repoFilter, setRepoFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all")

  const { data: repos = [] } = useQuery({
    queryKey: ["nova-connected-repos"],
    queryFn: () => getConnectedRepos(),
    staleTime: 60_000,
  })

  const { data: reviews = [], isLoading, isFetching, error } = useQuery({
    queryKey: ["nova-reviews", repoFilter === "all" ? undefined : repoFilter],
    queryFn: () => getReviews(repoFilter === "all" ? undefined : repoFilter),
    refetchInterval: (q) =>
      q.state.data?.some((item) => item.status === "pending") ? 5_000 : false,
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reviews.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      if (!q) return true
      return (
        item.prTitle.toLowerCase().includes(q)
        || item.repository.fullName.toLowerCase().includes(q)
        || String(item.prNumber).includes(q)
        || (item.summary ?? "").toLowerCase().includes(q)
      )
    })
  }, [query, reviews, statusFilter])

  const counts = useMemo(() => {
    const base = {
      all: reviews.length,
      completed: 0,
      pending: 0,
      unreviewed: 0,
      failed: 0,
    }
    for (const item of reviews) {
      if (item.status in base) {
        base[item.status as keyof typeof base] += 1
      }
    }
    return base
  }, [reviews])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0e0e10]">
      <div className="mx-auto w-full max-w-[1040px] shrink-0 px-5 pb-5 pt-10 sm:px-10 sm:pt-14">
        <div className="flex items-start gap-3">
          <NovaMark />
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-medium tracking-[-0.025em] text-[#e8e8e8]">Pull requests</h1>
            <p className="mt-0.5 text-[12px] text-[#85858e]">
              Supercode Review across connected repositories
              {isFetching && !isLoading ? " · refreshing" : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#151517] px-3">
            <Search className="size-3.5 text-[#7c7c85]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PRs, repos, summaries"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#e8e8e8] outline-none placeholder:text-[#71717a]"
            />
          </div>

          <label className="relative">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-[#151517] px-3 text-[12px] text-[#a0a0a0]">
              <FolderGit2 className="size-3.5" />
              {repoFilter === "all" ? "All repos" : repoFilter}
              <ChevronDown className="size-3 opacity-60" />
            </span>
            <select
              value={repoFilter}
              onChange={(event) => setRepoFilter(event.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Repository filter"
            >
              <option value="all">All repos</option>
              {repos.map((repo) => (
                <option key={repo.fullName ?? repo.name} value={repo.fullName ?? repo.name}>
                  {repo.fullName ?? repo.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All", counts.all],
              ["completed", "Reviewed", counts.completed],
              ["pending", "Pending", counts.pending],
              ["unreviewed", "Unreviewed", counts.unreviewed],
              ["failed", "Failed", counts.failed],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] transition",
                statusFilter === id
                  ? "bg-white/[0.08] text-white"
                  : "text-[#85858e] hover:bg-white/[0.04] hover:text-[#a0a0a0]",
              )}
            >
              {label}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[1040px] flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-[12px] text-[#85858e]">
            <Loader2 className="size-3.5 animate-spin" />
            Loading pull requests…
          </div>
        ) : error ? (
          <div className="mx-auto max-w-lg px-6 py-16 text-center">
            <AlertTriangle className="mx-auto size-5 text-amber-400" />
            <p className="mt-3 text-[13px] text-[#c8c8c8]">Could not load reviews</p>
            <p className="mt-1 text-[12px] text-[#85858e]">
              {error instanceof Error ? error.message : "Connect GitHub in Connections and try again."}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto max-w-lg px-6 py-16 text-center">
            <GitPullRequest className="mx-auto size-5 text-[#71717a]" />
            <p className="mt-3 text-[13px] text-[#c8c8c8]">
              {reviews.length === 0 ? "No pull requests yet" : "No matches"}
            </p>
            <p className="mt-1 text-[12px] text-[#85858e]">
              {reviews.length === 0
                ? "Connect a GitHub repo under Connections, then open PRs will appear here for Supercode Review."
                : "Try a different search or filter."}
            </p>
          </div>
        ) : (
          <div className="mx-5 mb-10 overflow-hidden rounded-xl border border-white/[0.08] bg-[#151517] divide-y divide-white/[0.06] sm:mx-10">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenPull(item.id)}
                className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-[#151517]"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[#8a8a8a]">
                  <GitPullRequest className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-[#e4e4e4]">
                      {item.prTitle}
                    </p>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#85858e]">
                    <span className="font-mono">{item.repository.fullName}</span>
                    <span>#{item.prNumber}</span>
                    {item.prState ? (
                      <span className={cn("rounded-full px-1.5 py-0.5 capitalize", prStateChip(item.prState))}>
                        {item.prState}
                      </span>
                    ) : null}
                  </div>
                  {item.summary ? (
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-5 text-[#8a8a8a]">
                      {item.summary}
                    </p>
                  ) : null}
                </div>
                <a
                  href={item.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-1 text-[#7c7c85] transition hover:text-[#2dd4bf]"
                  aria-label="Open on GitHub"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
