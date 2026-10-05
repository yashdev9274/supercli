"use client"

import { ArrowRight, Bug, ChevronDown, FileCode2, Loader2, ShieldCheck } from "lucide-react"

import { cn } from "@/lib/utils"
import { CodeSnippet } from "@/modules/bugs-caught/components/code-snippet"
import {
  resolveFindingPath,
  type ParsedFinding,
} from "@/modules/bugs-caught/lib/parse-findings"
import { ReviewMarkdown } from "@/modules/pull-requests/components/review-markdown"

const SEVERITY_COLORS: Record<string, string> = {
  critical: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
  high: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "border-border bg-muted/40 text-muted-foreground",
  nit: "border-border bg-muted/40 text-muted-foreground",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400",
}

export function ReviewFindingsPanel({
  findings,
  filenames,
  isGenerating,
  completed,
  failed,
  onSelectFile,
}: {
  findings: ParsedFinding[]
  filenames: ReadonlySet<string>
  isGenerating: boolean
  completed: boolean
  failed: boolean
  onSelectFile: (filename: string) => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="pr-findings-panel">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4 pr-12">
        <Bug className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
        <h2 className="text-[12px] font-medium">Bugs found</h2>
        <span className="ml-auto rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {completed ? findings.length : "—"}
        </span>
      </header>

      {isGenerating ? (
        <div className="p-4" role="status">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            Looking for bugs…
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/75">
            Findings will appear when the review is complete.
          </p>
          <div className="mt-5 space-y-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="space-y-3 rounded-lg border border-border/60 p-3">
                <div className="h-3 w-12 animate-pulse rounded bg-muted/50 motion-reduce:animate-none" />
                <div className="h-3 w-full animate-pulse rounded bg-muted/40 motion-reduce:animate-none" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted/30 motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ) : !completed ? (
        <div className="px-6 py-12 text-center">
          <Bug className="mx-auto h-6 w-6 text-muted-foreground/35" aria-hidden="true" />
          <p className="mt-3 text-[12px] font-medium">
            {failed ? "Review unavailable" : "Waiting for a review"}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {failed ? "Retry the review to see its findings here." : "Run a review to see potential bugs and suggested fixes."}
          </p>
        </div>
      ) : findings.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <ShieldCheck className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p className="mt-3 text-[12px] font-medium">No findings to show</p>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            This review didn’t list any structured findings. Read the full analysis for context.
          </p>
        </div>
      ) : (
        <>
          <p className="shrink-0 border-b border-border/60 px-4 py-2.5 text-[10px] text-muted-foreground">
            Review findings, highest severity first
          </p>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {findings.map((finding, index) => {
              const path = resolveFindingPath(finding.filePath, filenames)
              return (
                <article
                  key={`${finding.severity}:${finding.filePath}:${finding.title}:${index}`}
                  className="overflow-hidden rounded-lg border border-border/80 bg-background"
                >
                  <details className="group/finding" open={index === 0}>
                    <summary className="cursor-pointer list-none p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "max-w-32 truncate rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]",
                          SEVERITY_COLORS[finding.severity] ?? SEVERITY_COLORS.info,
                        )}>
                          {finding.severity}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground/50">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground/60 group-open/finding:rotate-180" aria-hidden="true" />
                      </div>
                      <h3 className="mt-2.5 break-words text-[12px] font-medium leading-relaxed">
                        {finding.title}
                      </h3>
                      <div className="mt-2 flex min-w-0 items-center gap-1.5 text-muted-foreground/75">
                        <FileCode2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 truncate font-mono text-[10px]" title={finding.filePath}>
                          {finding.filePath}
                        </span>
                      </div>
                    </summary>
                    <div className="border-t border-border/50 px-3 py-3">
                      {finding.description ? (
                        <div className="break-words [&_.review-md]:text-[12px] [&_p]:text-[12px] [&_p]:leading-relaxed">
                          <ReviewMarkdown source={finding.description} />
                        </div>
                      ) : null}
                      {finding.snippets.map((snippet, snippetIndex) => (
                        <CodeSnippet key={snippetIndex} snippet={snippet} filePath={path ?? finding.filePath} />
                      ))}
                    </div>
                  </details>
                  <div className="border-t border-border/50 px-3 py-2">
                    {path ? (
                      <button
                        type="button"
                        onClick={() => onSelectFile(path)}
                        aria-label={`View ${finding.title} in diff`}
                        className="flex min-h-7 w-full items-center justify-between text-[11px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
                      >
                        View in diff <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ) : (
                      <p className="py-1 text-[10px] text-muted-foreground/70">No matching diff available</p>
                    )}
                  </div>
                </article>
              )
            })}
            <p className="px-1 pb-2 pt-1 text-[10px] leading-relaxed text-muted-foreground/65">
              AI-identified findings. Verify them against the code before making changes.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
