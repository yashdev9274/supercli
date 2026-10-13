"use client"

import { useState } from "react"
import { File as FileIcon, FileCode2, FileJson } from "lucide-react"
import { cn } from "@/lib/utils"
import { CodeBlock } from "./code-block"

export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed"

export interface FileCardData {
  path: string
  content?: string
  status?: FileChangeStatus
  language?: string
}

const STATUS_STYLES: Record<FileChangeStatus, { label: string; className: string }> = {
  added: { label: "A", className: "bg-emerald-500/15 text-emerald-500" },
  modified: { label: "M", className: "bg-amber-500/15 text-amber-500" },
  deleted: { label: "D", className: "bg-red-500/15 text-red-500" },
  renamed: { label: "R", className: "bg-blue-500/15 text-blue-500" },
}

const CODE_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "swift", "kt", "kts",
  "c", "cc", "cpp", "h", "hpp", "java", "rb", "php", "sh", "bash", "zsh", "sql",
  "css", "scss", "html", "md", "mdx", "yml", "yaml", "toml", "graphql", "vue", "svelte",
])

function iconForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  if (ext === "json") return <FileJson className="size-4" />
  if (CODE_EXTS.has(ext)) return <FileCode2 className="size-4" />
  return <FileIcon className="size-4" />
}

export function FileCard({ path, content, status, language }: FileCardData) {
  const [open, setOpen] = useState(Boolean(content))
  const parts = path.split("/")
  const basename = parts[parts.length - 1] || path
  const dir = parts.slice(0, -1).join("/")
  const statusStyle = status ? STATUS_STYLES[status] : null
  const expandable = content != null

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card/40 transition-colors hover:border-border/80">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left",
          expandable ? "cursor-pointer transition-colors hover:bg-muted/20" : "cursor-default"
        )}
      >
        <span className="shrink-0 text-muted-foreground/70">{iconForPath(path)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{basename}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground/60" title={dir}>
            {dir || "/"}
          </span>
        </span>
        {language ? (
          <span className="hidden shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
            {language}
          </span>
        ) : null}
        {statusStyle ? (
          <span
            className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold", statusStyle.className)}
            title={status}
          >
            {statusStyle.label}
          </span>
        ) : null}
      </button>
      {content && open ? (
        <div className="border-t border-border/60">
          <CodeBlock code={content} language={language} maxHeight={320} />
        </div>
      ) : null}
    </article>
  )
}
