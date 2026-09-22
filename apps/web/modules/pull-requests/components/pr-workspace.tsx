"use client"

import { useMemo, useState } from "react"
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Github,
  Loader2,
  MoreHorizontal,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PrDiffFile, ReviewDetail } from "@/modules/dashboard/actions"
import { Button } from "@/components/ui/button"
import { ReviewMarkdown } from "@/modules/pull-requests/components/review-markdown"

export type PrTab = "Overview" | "Diff"

type FileTreeNode = {
  name: string
  path: string
  children: Map<string, FileTreeNode>
  file?: PrDiffFile
}

type DiffLine = {
  content: string
  kind: "add" | "del" | "context" | "hunk" | "meta"
  oldLine: number | null
  newLine: number | null
}

function initials(name?: string | null) {
  const raw = (name || "").trim()
  if (!raw) return "?"
  const parts = raw.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function statusLabel(status: string) {
  if (status === "added") return "Added"
  if (status === "removed") return "Deleted"
  if (status === "renamed") return "Renamed"
  return "Modified"
}

function buildFileTree(files: PrDiffFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "root",
    path: "",
    children: new Map(),
  }

  for (const file of files) {
    const parts = file.filename.split("/").filter(Boolean)
    let current = root
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/")
      let node = current.children.get(part)
      if (!node) {
        node = { name: part, path, children: new Map() }
        current.children.set(part, node)
      }
      if (index === parts.length - 1) node.file = file
      current = node
    })
  }

  return root
}

function sortedNodes(node: FileTreeNode) {
  return Array.from(node.children.values()).sort((a, b) => {
    if (Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1
    return a.name.localeCompare(b.name)
  })
}

function fileTreeTotals(node: FileTreeNode) {
  if (node.file) {
    return { additions: node.file.additions, deletions: node.file.deletions }
  }
  let additions = 0
  let deletions = 0
  for (const child of node.children.values()) {
    const totals = fileTreeTotals(child)
    additions += totals.additions
    deletions += totals.deletions
  }
  return { additions, deletions }
}

function parsePatch(patch: string): DiffLine[] {
  const result: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const content of patch.split("\n")) {
    const hunk = content.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      result.push({ content, kind: "hunk", oldLine: null, newLine: null })
      continue
    }
    if (content.startsWith("+++") || content.startsWith("---")) {
      result.push({ content, kind: "meta", oldLine: null, newLine: null })
      continue
    }
    if (content.startsWith("+")) {
      result.push({ content, kind: "add", oldLine: null, newLine })
      newLine += 1
      continue
    }
    if (content.startsWith("-")) {
      result.push({ content, kind: "del", oldLine, newLine: null })
      oldLine += 1
      continue
    }
    result.push({ content, kind: "context", oldLine, newLine })
    oldLine += 1
    newLine += 1
  }

  return result
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/70 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-muted/40 hover:text-foreground active:scale-[0.97]"
    >
      {children}
    </button>
  )
}

function TreeNode({
  node,
  depth,
  selectedFile,
  onSelectFile,
}: {
  node: FileTreeNode
  depth: number
  selectedFile: string | null
  onSelectFile: (filename: string) => void
}) {
  const [open, setOpen] = useState(true)
  const isFile = Boolean(node.file)
  const totals = fileTreeTotals(node)

  if (isFile && node.file) {
    const isAdded = node.file.status === "added"
    return (
      <button
        type="button"
        onClick={() => onSelectFile(node.file!.filename)}
        className={cn(
          "group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12px] transition-colors hover:bg-muted/35",
          selectedFile === node.file.filename
            ? "bg-muted/55 text-foreground"
            : "text-muted-foreground",
        )}
        style={{ paddingLeft: `${10 + depth * 12}px` }}
      >
        {isAdded ? (
          <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/75" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <span className="shrink-0 font-mono text-[10px] text-emerald-500">
          +{node.file.additions}
        </span>
        {node.file.deletions > 0 ? (
          <span className="shrink-0 font-mono text-[10px] text-red-400">
            −{node.file.deletions}
          </span>
        ) : null}
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-[12px] text-foreground/80 transition-colors hover:bg-muted/35"
        style={{ paddingLeft: `${4 + depth * 12}px` }}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/65" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/65" />
        )}
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {!open ? (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/45">
            +{totals.additions} −{totals.deletions}
          </span>
        ) : null}
      </button>
      {open ? (
        <div>
          {sortedNodes(node).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FileTreePanel({
  review,
  files,
  isLoading,
  selectedFile,
  onSelectFile,
}: {
  review: ReviewDetail | null | undefined
  files: PrDiffFile[]
  isLoading: boolean
  selectedFile: string | null
  onSelectFile: (filename: string) => void
}) {
  const tree = useMemo(() => buildFileTree(files), [files])

  return (
    <aside className="flex h-full min-h-0 w-[292px] shrink-0 flex-col border-r border-border bg-card/25">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
            Pull request
          </div>
          <div className="truncate text-[12px] font-medium text-foreground/90">
            {review ? `#${review.prNumber}` : "Loading…"}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton label="Collapse folders">
            <Code2 className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Open repository">
            <Folder className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
        <span className="truncate text-[11px] text-muted-foreground">
          {review?.repository.fullName ?? "Changed files"}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>

      <nav aria-label="Changed files" className="flex-1 overflow-y-auto px-1.5 py-2 scrollbar-none">
        {isLoading ? (
          <div className="space-y-2 px-2 py-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-6 animate-pulse rounded bg-muted/25" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <FileCode2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground/35" />
            <p className="text-xs text-muted-foreground">No changed files available.</p>
          </div>
        ) : (
          sortedNodes(tree).map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </nav>
    </aside>
  )
}

function PrStateBadge({ state }: { state?: ReviewDetail["prState"] }) {
  if (state === "merged") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-[12px] font-medium text-violet-400">
        <GitMerge className="h-3.5 w-3.5" /> Merged
      </span>
    )
  }
  if (state === "closed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-[12px] font-medium text-red-400">
        <X className="h-3.5 w-3.5" /> Closed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-[12px] font-medium text-emerald-400">
      <GitPullRequest className="h-3.5 w-3.5" /> Open
    </span>
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

  return (
    <article className="mx-auto w-full max-w-[840px] pb-16">
      <div className="border-b border-border/70 pb-6">
        <PrStateBadge state={review.prState} />
        <p className="mt-4 text-[12px] text-muted-foreground">
          {review.repository.fullName} · #{review.prNumber}
        </p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
          {review.prTitle}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {review.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.authorAvatar}
              alt={githubUsername}
              className="h-6 w-6 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
              {initials(githubUsername)}
            </span>
          )}
          <strong className="font-medium text-foreground/90">{githubUsername}</strong>
          {review.baseRef && review.headRef ? (
            <>
              <span className="rounded-full bg-muted/55 px-2 py-0.5 font-mono text-[10px] text-foreground/75">
                {review.baseRef}
              </span>
              <span className="text-muted-foreground/40">←</span>
              <span className="rounded-full bg-muted/55 px-2 py-0.5 font-mono text-[10px] text-foreground/75">
                {review.headRef}
              </span>
            </>
          ) : null}
          <span className="text-muted-foreground/35">·</span>
          <span>{review.changedFiles ?? 0} files</span>
          {typeof review.additions === "number" ? (
            <span className="font-mono text-emerald-500">+{review.additions}</span>
          ) : null}
          {typeof review.deletions === "number" ? (
            <span className="font-mono text-red-400">−{review.deletions}</span>
          ) : null}
        </div>
      </div>

      <section className="py-7">
        <h2 className="mb-5 text-[18px] font-semibold tracking-tight text-foreground">
          Description
        </h2>
        {review.body?.trim() ? (
          <ReviewMarkdown source={review.body} />
        ) : (
          <p className="text-sm text-muted-foreground">No description provided.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card/30">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/15 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/supercode-logo.png" alt="" className="h-4 w-4 rounded-sm object-cover" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Supercode review
            </span>
          </div>
          {!completed ? (
            <span className="text-[11px] text-muted-foreground/55">
              {isGenerating ? "Running — auto-refreshes" : "Ready to review"}
            </span>
          ) : null}
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
              className="gap-1.5 transition-transform duration-150 active:scale-[0.97]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {review.status === "failed" ? "Retry review" : "Generate review"}
            </Button>
          </div>
        )}
      </section>
    </article>
  )
}

function DiffFileCard({ file, selected }: { file: PrDiffFile; selected: boolean }) {
  const [open, setOpen] = useState(selected)
  const lines = useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch])

  return (
    <article
      id={`diff-${encodeURIComponent(file.filename)}`}
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card/30"
    >
      <header className="flex min-h-10 items-center gap-2 bg-muted/25 px-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted/45 hover:text-foreground active:scale-[0.97]"
          aria-label={open ? `Collapse ${file.filename}` : `Expand ${file.filename}`}
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">
          {file.filename.split("/").at(-1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/60">
          {file.filename.includes("/") ? file.filename.slice(0, file.filename.lastIndexOf("/")) : ""}
        </span>
        <IconButton
          label={`Copy ${file.filename}`}
          onClick={() => navigator.clipboard.writeText(file.filename)}
        >
          <Copy className="h-3.5 w-3.5" />
        </IconButton>
        <span className="font-mono text-[10px] text-emerald-500">+{file.additions}</span>
        {file.deletions > 0 ? (
          <span className="font-mono text-[10px] text-red-400">−{file.deletions}</span>
        ) : null}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            file.status === "added"
              ? "bg-emerald-500/15 text-emerald-400"
              : file.status === "removed"
                ? "bg-red-500/15 text-red-400"
                : "bg-sky-500/15 text-sky-400",
          )}
        >
          {statusLabel(file.status)}
        </span>
        <IconButton label={`More actions for ${file.filename}`}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </IconButton>
      </header>

      {open ? (
        file.patch ? (
          <div className="overflow-x-auto border-t border-border/70 font-mono text-[11.5px] leading-[1.55]">
            {lines.map((line, index) => (
              <div
                key={`${index}-${line.content}`}
                className={cn(
                  "grid min-w-max grid-cols-[44px_44px_minmax(720px,1fr)]",
                  line.kind === "add" && "bg-emerald-500/10",
                  line.kind === "del" && "bg-red-500/10",
                  line.kind === "hunk" && "bg-sky-500/10 text-sky-300/85",
                  line.kind === "meta" && "text-muted-foreground/55",
                )}
              >
                <span className="select-none border-r border-border/45 px-2 text-right text-muted-foreground/35">
                  {line.oldLine ?? ""}
                </span>
                <span className="select-none border-r border-border/45 px-2 text-right text-muted-foreground/35">
                  {line.newLine ?? ""}
                </span>
                <code
                  className={cn(
                    "whitespace-pre px-3 text-foreground/78",
                    line.kind === "add" && "text-emerald-200/90",
                    line.kind === "del" && "text-red-200/90",
                    line.kind === "hunk" && "text-sky-300/85",
                  )}
                >
                  {line.content || " "}
                </code>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-t border-border/70 px-4 py-5 text-xs text-muted-foreground">
            Binary file or patch omitted by GitHub.
          </p>
        )
      ) : null}
    </article>
  )
}

function DiffView({
  files,
  isLoading,
  selectedFile,
}: {
  files: PrDiffFile[]
  isLoading: boolean
  selectedFile: string | null
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
    <div className="mx-auto w-full max-w-[1200px] space-y-3 pb-12">
      <div className="flex items-center justify-between px-1 pb-2 pt-1">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Changed files</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {files.length} files in this pull request
          </p>
        </div>
        <div className="font-mono text-[11px]">
          <span className="text-emerald-500">+{files.reduce((sum, file) => sum + file.additions, 0)}</span>{" "}
          <span className="text-red-400">−{files.reduce((sum, file) => sum + file.deletions, 0)}</span>
        </div>
      </div>
      {files.map((file) => (
        <DiffFileCard key={file.filename} file={file} selected={selectedFile === file.filename} />
      ))}
    </div>
  )
}

export function PrWorkspace({
  review,
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
  files: PrDiffFile[]
  filesLoading: boolean
  tab: PrTab
  onTabChange: (tab: PrTab) => void
  isGenerating: boolean
  completed: boolean
  showGenerate: boolean
  onGenerate: () => void
  generatePending: boolean
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const selectFile = (filename: string) => {
    setSelectedFile(filename)
    onTabChange("Diff")
    window.setTimeout(() => {
      document
        .getElementById(`diff-${encodeURIComponent(filename)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 0)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          {review ? (
            <>
              <span className="shrink-0 text-muted-foreground">#{review.prNumber}</span>
              <strong className="min-w-0 truncate font-medium text-foreground/90">
                {review.prTitle}
              </strong>
              <a
                href={review.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
                aria-label="Open on GitHub"
              >
                <Github className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <span className="text-muted-foreground">Loading pull request…</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {(showGenerate || isGenerating || completed) && review ? (
            <Button
              size="sm"
              variant={completed ? "outline" : "default"}
              disabled={isGenerating || generatePending}
              onClick={onGenerate}
              className="mr-1 h-7 gap-1.5 px-2.5 text-[11px] transition-transform duration-150 active:scale-[0.97]"
            >
              {isGenerating || generatePending ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
              ) : (
                <><Sparkles className="h-3 w-3" /> {completed ? "Regenerate" : "Generate"}</>
              )}
            </Button>
          ) : null}
          {review?.prUrl ? (
            <a
              href={review.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted/40 hover:text-foreground active:scale-[0.97]"
            >
              View on GitHub <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FileTreePanel
          review={review}
          files={files}
          isLoading={filesLoading}
          selectedFile={selectedFile}
          onSelectFile={selectFile}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-5">
            <div className="flex h-full items-center gap-5">
              {(["Overview", "Diff"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onTabChange(item)}
                  className={cn(
                    "relative h-full text-[12px] font-medium transition-colors duration-150",
                    tab === item ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item === "Overview" ? "Description" : `Diff ${files.length || ""}`}
                  {tab === item ? (
                    <span className="absolute inset-x-0 bottom-0 h-px bg-foreground" />
                  ) : null}
                </button>
              ))}
            </div>
            {review?.baseRef && review.headRef ? (
              <div className="hidden items-center gap-1.5 text-[10px] text-muted-foreground md:flex">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">{review.baseRef}</span>
                <span className="text-muted-foreground/35">←</span>
                <span className="font-mono">{review.headRef}</span>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 md:px-8">
            {!review ? (
              <div className="mx-auto max-w-[840px] space-y-3 py-6">
                <div className="h-7 w-2/3 animate-pulse rounded bg-muted/30" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted/20" />
                <div className="mt-8 h-40 animate-pulse rounded-xl bg-muted/15" />
              </div>
            ) : tab === "Overview" ? (
              <OverviewBody
                review={review}
                isGenerating={isGenerating}
                completed={completed}
                onGenerate={onGenerate}
                generatePending={generatePending}
              />
            ) : (
              <DiffView files={files} isLoading={filesLoading} selectedFile={selectedFile} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
