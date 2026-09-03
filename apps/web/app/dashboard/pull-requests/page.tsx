"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { Search, GitPullRequest, CheckCircle2, SkipForward, AlertTriangle, ChevronDown, FolderGit2, Check, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import { useQuery } from "@tanstack/react-query"
import { getConnectedRepos, type RepoOption } from "@/modules/dashboard/actions/analytics"
import { getReviews, type ReviewItem } from "@/modules/dashboard/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ReviewStatus = "completed" | "pending" | "failed" | "unreviewed" | "skipped" | "trial_ended"

// --- Animation variants (per Emil Kowalski's motion philosophy) ---
const ease = [0.25, 0.1, 0.25, 1] as const
const easeOut = [0.4, 0, 1, 1] as const

const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.035 },
  },
}

const rowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15, ease: easeOut },
  },
}

// Module-scope clock so relative timestamps can be rendered without calling
// Date.now() during render.
let latestNow = Date.now()
const nowListeners = new Set<() => void>()
setInterval(() => {
  latestNow = Date.now()
  for (const listener of nowListeners) listener()
}, 30_000)

function subscribeNow(listener: () => void): () => void {
  nowListeners.add(listener)
  return () => {
    nowListeners.delete(listener)
  }
}

function useNow(): number {
  return useSyncExternalStore(subscribeNow, () => latestNow)
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  if (status === "completed") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease }}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-500"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Reviewed
      </motion.span>
    )
  }
  if (status === "pending") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease }}
        className="inline-flex items-center gap-1.5 text-xs text-amber-500"
      >
        <SkipForward className="h-3.5 w-3.5" />
        Pending
      </motion.span>
    )
  }
  if (status === "failed") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease }}
        className="inline-flex items-center gap-1.5 text-xs text-destructive"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Failed
      </motion.span>
    )
  }
  if (status === "skipped" || status === "trial_ended") {
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease }}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60"
      >
        <SkipForward className="h-3.5 w-3.5" />
        {status === "skipped" ? "Skipped" : "Trial Ended"}
      </motion.span>
    )
  }
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease }}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60"
    >
      <GitPullRequest className="h-3.5 w-3.5" />
      Unreviewed
    </motion.span>
  )
}

function PrStatePill({ state }: { state?: ReviewItem["prState"] }) {
  if (!state) return null
  const styles =
    state === "open"
      ? "text-emerald-500/90 bg-emerald-500/10 border-emerald-500/20"
      : state === "merged"
        ? "text-violet-400/90 bg-violet-500/10 border-violet-500/20"
        : "text-muted-foreground/70 bg-muted/30 border-border"
  return (
    <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", styles)}>
      {state}
    </span>
  )
}

export default function PullRequestsPage() {
  const [search, setSearch] = useState("")
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [repoSearch, setRepoSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<"last_updated" | "score">("last_updated")

  const { data: repos, isLoading: isLoadingRepos } = useQuery({
    queryKey: ["user-repos"],
    queryFn: async () => await getConnectedRepos(),
    refetchOnWindowFocus: false,
  })

  const { data: reviewsData, isLoading: isLoadingReviews } = useQuery({
    queryKey: ["reviews", selectedRepo],
    queryFn: async () => await getReviews(selectedRepo ?? undefined),
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const rows = query.state.data ?? []
      return rows.some((r) => r.status === "pending") ? 5000 : false
    },
  })

  const filteredRepos = repos?.filter((r: RepoOption) =>
    r.fullName.toLowerCase().includes(repoSearch.toLowerCase())
  ) ?? []

  const now = useNow()

  const timeAgo = (date: Date, now: number) => {
    const diff = now - new Date(date).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return "today"
    if (days === 1) return "1 day ago"
    if (days < 7) return `${days} days ago`
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return "1 week ago"
    return `${weeks} weeks ago`
  }

  const filtered = (reviewsData ?? []).map((r: ReviewItem) => ({
    id: r.id,
    title: r.prTitle,
    repo: r.repository.name,
    repoFullName: r.repository.fullName,
    number: r.prNumber,
    prUrl: r.prUrl,
    timeAgo: timeAgo(r.updatedAt ?? r.createdAt, now),
    reviewStatus: (r.status || "unreviewed") as ReviewStatus,
    summary: r.summary,
    prState: r.prState,
  })).filter((pr) => {
    const q = search.toLowerCase()
    const matchesSearch =
      pr.title.toLowerCase().includes(q) ||
      pr.repo.toLowerCase().includes(q) ||
      pr.repoFullName.toLowerCase().includes(q) ||
      (pr.summary?.toLowerCase().includes(q) ?? false) ||
      `#${pr.number}`.includes(search)
    return matchesSearch
  })

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((pr) => pr.id)))
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease }}
      className="flex flex-1 flex-col bg-background p-4 md:p-8 pt-8 min-h-screen"
    >
      <div className="mb-8 flex items-center gap-3">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.05, ease }}
          className="flex h-10 w-10 items-center justify-center border border-border bg-muted/20"
        >
          <GitPullRequest className="h-5 w-5 text-primary" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease }}
        >
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            Pull Requests
          </h1>
          <p className="text-xs text-muted-foreground/60">
            AI code reviews for your pull requests
          </p>
        </motion.div>
      </div>

      {/* Toolbar: Search + Repo Filter */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.15, ease }}
        className="relative mb-6 flex items-center gap-3"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Search pull requests..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-none border border-border bg-muted/10 pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>

        {/* Repo Filter Dropdown — mirrors dashboard-content pattern */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 border border-border bg-muted/30 px-3 py-2.5 text-[11px] font-medium text-foreground/80 hover:bg-muted/50 hover:text-foreground transition-colors outline-none shrink-0">
              <FolderGit2 className="h-3.5 w-3.5 opacity-80" />
              {selectedRepo ?? "All Repositories"}
              <ChevronDown className="h-3 w-3 opacity-30" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[240px] p-1">
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2 border border-border bg-muted/30 px-2 py-1.5 text-[11px]">
                <Search className="h-3 w-3 opacity-50" />
                <input
                  value={repoSearch}
                  onChange={(e) => setRepoSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full bg-transparent outline-none placeholder:text-muted-foreground/50"
                />
              </div>
            </div>
            <DropdownMenuItem
              onClick={() => { setSelectedRepo(null); setRepoSearch(""); }}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              All Repositories
              {selectedRepo === null && <Check className="h-3 w-3 opacity-60" />}
            </DropdownMenuItem>
            {filteredRepos.map((repo: RepoOption) => (
              <DropdownMenuItem
                key={repo.fullName}
                onClick={() => { setSelectedRepo(repo.fullName); setRepoSearch(""); }}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="flex items-center gap-2 truncate">
                  {repo.fullName}
                </span>
                {selectedRepo === repo.fullName && <Check className="h-3 w-3 opacity-60 shrink-0" />}
              </DropdownMenuItem>
            ))}
            {filteredRepos.length === 0 && !isLoadingRepos && (
              <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">
                No repositories found
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease }}
        className="border border-border rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 border-b border-border bg-muted/20 px-5 py-3">
          <div className="col-span-1 flex items-center">
            <input
              type="checkbox"
              checked={selected.size === filtered.length && filtered.length > 0}
              onChange={toggleAll}
              className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
            />
          </div>
          <div className="col-span-6 flex items-center">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
              Pull request
            </span>
          </div>
          <div className="col-span-3 flex items-center gap-1 cursor-pointer select-none" onClick={() => setSortBy(sortBy === "last_updated" ? "score" : "last_updated")}>
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
              Last Updated
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
          </div>
          <div className="col-span-2 flex items-center">
            <span className="text-[10px] font-bold tracking-wider text-muted-foreground/40 uppercase">
              Review Status
            </span>
          </div>
        </div>

        {/* Rows */}
        <AnimatePresence mode="popLayout">
          {isLoadingReviews ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">Loading reviews…</p>
            </div>
          ) : filtered.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-6 py-16 text-center"
            >
              <p className="text-sm text-muted-foreground">No pull requests found.</p>
            </motion.div>
          ) : (
            <motion.div
              key={selectedRepo ?? "all"}
              variants={listVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {filtered.map((pr) => (
                <Link
                  key={pr.id}
                  href={`/dashboard/pull-requests/${pr.id}`}
                  className="block"
                >
                  <motion.div
                    variants={rowVariants}
                    className={cn(
                      "grid grid-cols-12 gap-4 border-b border-border px-5 py-4 last:border-b-0 hover:bg-muted/10 transition-colors cursor-pointer",
                      selected.has(pr.id) && "bg-muted/20"
                    )}
                  >
                    <div className="col-span-1 flex items-center">
                      <input
                        type="checkbox"
                        checked={selected.has(pr.id)}
                        onChange={() => toggleSelect(pr.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                      />
                    </div>
                    <div className="col-span-6 min-w-0">
                      <div className="group flex items-center gap-2 min-w-0">
                        <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {pr.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                        <span className="text-[11px] text-muted-foreground/50 font-mono">
                          {pr.repoFullName}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50">
                          #{pr.number}
                        </span>
                        <PrStatePill state={pr.prState} />
                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            window.open(pr.prUrl, "_blank", "noopener,noreferrer")
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              e.stopPropagation()
                              window.open(pr.prUrl, "_blank", "noopener,noreferrer")
                            }
                          }}
                          className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                      {pr.summary && (
                        <p className="mt-1.5 ml-5 text-[11px] text-muted-foreground/55 line-clamp-1">
                          {pr.summary}
                        </p>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center">
                      <span className="text-xs text-muted-foreground/70">{pr.timeAgo}</span>
                    </div>
                    <div className="col-span-2 flex items-center">
                      <ReviewStatusBadge status={pr.reviewStatus} />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
