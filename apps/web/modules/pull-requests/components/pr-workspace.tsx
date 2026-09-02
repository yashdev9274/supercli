"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Link2,
  ListFilter,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PrDiffFile, ReviewDetail, ReviewItem } from "@/modules/dashboard/actions"
import { Button } from "@/components/ui/button"
import { ReviewMarkdown } from "@/modules/pull-requests/components/review-markdown"

export type PrTab = "Overview" | "Diff"

function timeAgoShort(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

function initials(name?: string | null) {
  const raw = (name || "").trim()
  if (!raw) return "?"
  const parts = raw.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function IconButton({
  children,
  label,
  className,
  onClick,
}: {
  children: React.ReactNode
  label: string
  className?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/40 hover:text-foreground active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </button>
  )
}

function StatusIcon({ state }: { state?: ReviewItem["prState"] }) {
  if (state === "merged") {
    return <GitMerge className="h-3.5 w-3.5 shrink-0 text-violet-400" />
  }
  if (state === "closed") {
    return <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  }
  return <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
}

function groupFiles(files: PrDiffFile[]) {
  const groups = new Map<string, PrDiffFile[]>()
  for (const file of files) {
    const parts = file.filename.split("/")
    const dir =
      parts.length > 1 ? parts.slice(0, -1).join("/") : "root"
    const list = groups.get(dir) ?? []
    list.push(file)
    groups.set(dir, list)
  }
  return Array.from(groups.entries()).map(([dir, items]) => {
    const additions = items.reduce((s, f) => s + f.additions, 0)
    const deletions = items.reduce((s, f) => s + f.deletions, 0)
    return { dir, items, additions, deletions }
  })
}

function basename(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

function dirname(path: string) {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(0, i) : ""
}

/** Lightweight PR body renderer — headings, lists, checkboxes, paragraphs. */
function PrBodyMarkdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseBodyBlocks(source), [source])
  return (
    <div className="space-y-4 text-[13.5px] leading-relaxed text-foreground/90">
      {blocks.map((block, i) => {
        if (block.type === "h2") {
          return (
            <h2
              key={i}
              className="pt-2 text-[15px] font-semibold tracking-tight text-foreground"
            >
              {block.text}
            </h2>
          )
        }
        if (block.type === "h3") {
          return (
            <h3
              key={i}
              className="pt-1 text-[13px] font-semibold text-foreground"
            >
              {block.text}
            </h3>
          )
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="space-y-1.5 pl-0">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-foreground/85">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )
        }
        if (block.type === "checklist") {
          return (
            <ul key={i} className="space-y-2">
              {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                      item.checked
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
                        : "border-border bg-transparent",
                    )}
                  >
                    {item.checked ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span
                    className={cn(
                      "text-foreground/85",
                      item.checked && "text-muted-foreground line-through",
                    )}
                  >
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-muted-foreground">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

type BodyBlock =
  | { type: "h2" | "h3" | "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "checklist"; items: { text: string; checked: boolean }[] }

function parseBodyBlocks(source: string): BodyBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  const blocks: BodyBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      i += 1
      continue
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() })
      i += 1
      continue
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4).trim() })
      i += 1
      continue
    }
    if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
      const items: { text: string; checked: boolean }[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = t.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
        if (!m) break
        items.push({ checked: m[1].toLowerCase() === "x", text: m[2] })
        i += 1
      }
      blocks.push({ type: "checklist", items })
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length) {
        const t = lines[i].trim()
        const m = t.match(/^[-*]\s+(.*)$/)
        if (!m || /^[-*]\s+\[[ xX]\]/.test(t)) break
        items.push(m[1])
        i += 1
      }
      blocks.push({ type: "ul", items })
      continue
    }
    const paras: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const t = lines[i].trim()
      if (!t || t.startsWith("#") || /^[-*]\s+/.test(t)) break
      paras.push(t)
      i += 1
    }
    blocks.push({ type: "p", text: paras.join(" ") })
  }
  return blocks
}

function ReviewListPanel({
  reviews,
  activeId,
  isLoading,
  listTab,
  onListTab,
}: {
  reviews: ReviewItem[]
  activeId: string
  isLoading: boolean
  listTab: "for_you" | "created"
  onListTab: (t: "for_you" | "created") => void
}) {
  const grouped = useMemo(() => {
    const buckets: Record<"open" | "merged" | "closed" | "other", ReviewItem[]> = {
      open: [],
      merged: [],
      closed: [],
      other: [],
    }
    for (const r of reviews) {
      if (r.prState === "open") buckets.open.push(r)
      else if (r.prState === "merged") buckets.merged.push(r)
      else if (r.prState === "closed") buckets.closed.push(r)
      else buckets.other.push(r)
    }
    return buckets
  }, [reviews])

  const sections: { key: keyof typeof grouped; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "merged", label: "Merged" },
    { key: "closed", label: "Closed" },
    { key: "other", label: "Other" },
  ]

  return (
    <aside className="flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-border bg-card/40">
      {/* Header lives in shared top row with crumb bar — only tabs + list here */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => onListTab("for_you")}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
            listTab === "for_you"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          For you
        </button>
        <button
          type="button"
          onClick={() => onListTab("created")}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-150",
            listTab === "created"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Created
        </button>
      </div>

      <nav
        aria-label="Pull requests"
        className="flex-1 overflow-y-auto px-1.5 py-2 scrollbar-none"
      >
        {isLoading ? (
          <div className="space-y-2 px-2 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-muted/30" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No pull requests yet.
          </p>
        ) : (
          sections.map(({ key, label }) => {
            const items = grouped[key]
            if (items.length === 0) return null
            return (
              <div key={key} className="mb-3">
                <div className="mb-1 flex items-center gap-1 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  <span>{label}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const selected =
                      item.id === activeId ||
                      (item.prNumber &&
                        activeId.includes(`__${item.prNumber}`) &&
                        activeId.includes(item.repository.owner))
                    return (
                      <Link
                        key={item.id}
                        href={`/dashboard/pull-requests/${encodeURIComponent(item.id)}`}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 active:scale-[0.99]",
                          selected
                            ? "bg-muted/60 text-foreground"
                            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                        )}
                      >
                        <StatusIcon state={item.prState} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] leading-snug">
                          {item.prTitle}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
                          {timeAgoShort(item.updatedAt ?? item.createdAt)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </nav>
    </aside>
  )
}

function RightRail({
  review,
  files,
  filesLoading,
}: {
  review: ReviewDetail
  files: PrDiffFile[]
  filesLoading: boolean
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const groups = useMemo(() => groupFiles(files), [files])

  const toggleGroup = (dir: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [dir]: !(prev[dir] ?? true),
    }))
  }

  const stateLabel =
    review.prState === "merged"
      ? "Merged"
      : review.prState === "closed"
        ? "Closed"
        : review.prState === "open"
          ? "Open"
          : "—"

  return (
    <aside className="hidden h-full min-h-0 w-[260px] shrink-0 flex-col gap-0 border-l border-border bg-card/20 xl:flex">
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-none">
        <section className="mb-5">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground/70">
            Status
          </div>
          <div className="flex items-center gap-2 text-[13px] text-foreground">
            <StatusIcon state={review.prState} />
            <span>{stateLabel}</span>
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground/70">
            Resolves
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Link issue
          </button>
        </section>

        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground/70">
            <span>Reviewers</span>
            <Plus className="h-3.5 w-3.5 opacity-70" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/supercode-logo.png"
                alt="Supercode"
                className="h-6 w-6 shrink-0 rounded-full border border-border object-cover bg-muted"
              />
              <span className="flex-1 truncate text-[12.5px] text-foreground/90">
                Supercode AI
              </span>
              <IconButton label="Comment">
                <MessageCircle className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            {review.status === "completed" ? (
              <div className="flex items-center gap-1.5 pl-8 text-[11px] text-emerald-500">
                <Check className="h-3 w-3" />
                Review complete
              </div>
            ) : review.status === "pending" ? (
              <div className="flex items-center gap-1.5 pl-8 text-[11px] text-amber-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Generating…
              </div>
            ) : null}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-2 text-[11px] font-medium text-muted-foreground/70">
            Checks
          </div>
          <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-foreground/90">
            {review.status === "completed" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>AI review passed</span>
              </>
            ) : review.status === "pending" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span>Running AI review</span>
              </>
            ) : review.status === "failed" ? (
              <>
                <X className="h-3.5 w-3.5 text-destructive" />
                <span>AI review failed</span>
              </>
            ) : (
              <span className="text-muted-foreground">No checks yet</span>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 text-[11px] font-medium text-muted-foreground/70">
            {typeof review.changedFiles === "number"
              ? `${review.changedFiles} files changed`
              : filesLoading
                ? "Loading files…"
                : `${files.length} files changed`}
          </div>

          {filesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-6 animate-pulse rounded bg-muted/30" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">No file list yet.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const open = openGroups[g.dir] ?? true
                return (
                  <div key={g.dir}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.dir)}
                      className="mb-1 flex w-full items-center gap-1.5 text-left text-[12px] text-foreground/90"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {g.dir === "root" ? "Files" : g.dir.split("/").slice(-2).join("/")}
                      </span>
                      <small className="text-[10px] text-muted-foreground">
                        {g.items.length}
                      </small>
                      {open ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <b className="ml-auto font-mono text-[10px] font-normal text-emerald-500">
                        +{g.additions}{" "}
                        <em className="not-italic text-red-400">-{g.deletions}</em>
                      </b>
                    </button>
                    {open ? (
                      <div className="space-y-0.5">
                        {g.items.map((f) => (
                          <div
                            key={f.filename}
                            className="flex items-center gap-1.5 rounded px-1 py-1 text-[11.5px] text-muted-foreground"
                          >
                            <Code2 className="h-3 w-3 shrink-0 opacity-60" />
                            <span className="min-w-0 flex-1 truncate text-foreground/80">
                              {basename(f.filename)}
                            </span>
                            <small className="max-w-[72px] truncate text-[10px] text-muted-foreground/50">
                              {dirname(f.filename)}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}

function DiffView({
  files,
  isLoading,
}: {
  files: PrDiffFile[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <FileCode2 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No diff available for this PR.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-1 pb-10">
      {files.map((file) => (
        <div
          key={file.filename}
          className="overflow-hidden rounded-xl border border-border bg-card/40"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
            <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
              {file.filename}
            </span>
            <span className="font-mono text-[11px] text-emerald-500">+{file.additions}</span>
            <span className="font-mono text-[11px] text-red-400">−{file.deletions}</span>
          </div>
          {file.patch ? (
            <pre className="overflow-x-auto p-0 text-[12px] leading-[1.55]">
              {file.patch.split("\n").map((line, idx) => {
                const kind =
                  line.startsWith("+++") || line.startsWith("---")
                    ? "meta"
                    : line.startsWith("@@")
                      ? "hunk"
                      : line.startsWith("+")
                        ? "add"
                        : line.startsWith("-")
                          ? "del"
                          : "ctx"
                return (
                  <div
                    key={idx}
                    className={cn(
                      "whitespace-pre px-3 font-mono",
                      kind === "add" && "bg-emerald-500/10 text-emerald-400/95",
                      kind === "del" && "bg-red-500/10 text-red-400/95",
                      kind === "hunk" && "bg-sky-500/10 text-sky-400/90",
                      kind === "meta" && "text-muted-foreground/60",
                      kind === "ctx" && "text-foreground/75",
                    )}
                  >
                    {line || " "}
                  </div>
                )
              })}
            </pre>
          ) : (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Binary file or patch omitted.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function OverviewBody({
  review,
  isGenerating,
  completed,
  onGenerate,
  generatePending,
}: {
  review: ReviewDetail
  isGenerating: boolean
  completed: boolean
  onGenerate: () => void
  generatePending: boolean
}) {
  const githubUsername = review.author || "unknown"
  const branchLine =
    review.baseRef && review.headRef
      ? `${review.baseRef} ← ${review.headRef}`
      : review.repository.fullName

  return (
    <article className="min-w-0 flex-1 px-1 pb-12">
      <h1 className="text-[22px] font-semibold leading-snug tracking-tight text-foreground">
        {review.prTitle}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
        {review.authorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.authorAvatar}
            alt={githubUsername}
            className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
            {initials(githubUsername)}
          </span>
        )}
        <strong className="font-medium text-foreground/90">{githubUsername}</strong>
        <span className="opacity-40">·</span>
        <span>
          {review.repository.name}#{review.prNumber}
        </span>
        <span className="opacity-40">·</span>
        <span className="font-mono text-[11.5px] text-muted-foreground/80">
          {branchLine}
        </span>
      </div>

      <div className="mt-6 mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
        Description
        <ChevronDown className="h-3 w-3" />
      </div>

      {review.body?.trim() ? (
        <PrBodyMarkdown source={review.body} />
      ) : (
        <p className="text-sm text-muted-foreground">No description provided.</p>
      )}

      {/* AI review section */}
      <div className="mt-10 overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/15 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/supercode-logo.png"
              alt=""
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Supercode Review
            </span>
          </div>
          {!completed && (
            <span className="text-[11px] text-muted-foreground/55">
              {isGenerating
                ? "Running — auto-refreshes"
                : review.status === "failed"
                  ? "Failed — retry below"
                  : "Not generated yet"}
            </span>
          )}
        </div>

        {completed ? (
          <div className="px-4 py-5 sm:px-5">
            <ReviewMarkdown source={review.review || ""} />
          </div>
        ) : isGenerating ? (
          <div className="px-4 py-12 text-center">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating AI code review…</p>
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              {review.status === "failed"
                ? review.review || "The last review attempt failed."
                : "No AI review content yet."}
            </p>
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={generatePending}
              className="gap-1.5 active:scale-[0.97]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {review.status === "failed" ? "Retry review" : "Generate review"}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

export function PrWorkspace({
  activeId,
  review,
  reviews,
  reviewsLoading,
  files,
  filesLoading,
  tab,
  onTabChange,
  isGenerating,
  completed,
  showGenerate,
  onGenerate,
  generatePending,
}: {
  activeId: string
  review: ReviewDetail | null | undefined
  reviews: ReviewItem[]
  reviewsLoading: boolean
  files: PrDiffFile[]
  filesLoading: boolean
  tab: PrTab
  onTabChange: (t: PrTab) => void
  isGenerating: boolean
  completed: boolean
  showGenerate: boolean
  onGenerate: () => void
  generatePending: boolean
}) {
  const [listTab, setListTab] = useState<"for_you" | "created">("created")

  const additions =
    typeof review?.additions === "number" ? review.additions : undefined
  const deletions =
    typeof review?.deletions === "number" ? review.deletions : undefined

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {/* Shared top row: Reviews (left) aligns with PR crumb (right) */}
      <header className="flex h-11 shrink-0 border-b border-border">
        <div className="flex w-[248px] shrink-0 items-center justify-between gap-2 border-r border-border px-3">
          <span className="text-[13px] font-medium tracking-tight text-foreground">
            Reviews
          </span>
          <div className="flex items-center gap-0.5">
            <IconButton label="Filter">
              <ListFilter className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Settings">
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
            <span className="shrink-0 text-muted-foreground/55">No issue</span>
            <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
            {review ? (
              <>
                <strong className="shrink-0 font-semibold text-foreground">
                  #{review.prNumber}
                </strong>
                <span className="min-w-0 truncate text-foreground/85">
                  {review.prTitle}
                </span>
                {typeof additions === "number" ? (
                  <span className="shrink-0 font-mono text-[11px] text-emerald-500">
                    +{additions}
                  </span>
                ) : null}
                {typeof deletions === "number" ? (
                  <span className="shrink-0 font-mono text-[11px] text-red-400">
                    −{deletions}
                  </span>
                ) : null}
                {review.prUrl ? (
                  <a
                    href={review.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                    aria-label="Open on GitHub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">Loading…</span>
            )}
            <Star className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
            <MoreHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {(showGenerate || isGenerating || completed) && review ? (
              <Button
                size="sm"
                variant={completed ? "outline" : "default"}
                disabled={isGenerating || generatePending}
                onClick={onGenerate}
                className="mr-1 h-7 gap-1.5 px-2.5 text-[11px] active:scale-[0.97]"
              >
                {isGenerating || generatePending ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    {completed ? "Regenerate" : "Generate"}
                  </>
                )}
              </Button>
            ) : null}
            <IconButton label="Copy link">
              <Link2 className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton label="Branch">
              <GitBranch className="h-3.5 w-3.5" />
            </IconButton>
            {review?.prUrl ? (
              <a
                href={review.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open PR"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted/40 hover:text-foreground active:scale-[0.97]"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : (
              <IconButton label="Open">
                <ArrowUpRight className="h-3.5 w-3.5" />
              </IconButton>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ReviewListPanel
          reviews={reviews}
          activeId={activeId}
          isLoading={reviewsLoading}
          listTab={listTab}
          onListTab={setListTab}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
            <div className="flex items-center rounded-lg border border-border bg-muted/20 p-0.5">
              {(["Overview", "Diff"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onTabChange(item)}
                  className={cn(
                    "rounded-md px-3 py-1 text-[12px] font-medium transition-colors duration-150 active:scale-[0.98]",
                    tab === item
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/10 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground active:scale-[0.97]"
            >
              <Search className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto px-5 pt-5 md:px-8">
              {!review ? (
                <div className="space-y-3 py-6">
                  <div className="h-7 w-2/3 animate-pulse rounded bg-muted/30" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted/20" />
                  <div className="mt-8 h-40 animate-pulse rounded-xl bg-muted/15" />
                </div>
              ) : tab === "Overview" ? (
                <div className="flex gap-0">
                  <OverviewBody
                    review={review}
                    isGenerating={isGenerating}
                    completed={completed}
                    onGenerate={onGenerate}
                    generatePending={generatePending}
                  />
                </div>
              ) : (
                <DiffView files={files} isLoading={filesLoading} />
              )}
            </div>

            {review && tab === "Overview" ? (
              <RightRail
                review={review}
                files={files}
                filesLoading={filesLoading}
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
