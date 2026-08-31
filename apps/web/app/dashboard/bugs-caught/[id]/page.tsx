import prisma from "@super/db"
import { requireAuth } from "@/modules/components/utils/auth-utils"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, FileCode2 } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import {
  extractFindingsSection,
  parseFindings,
  type CodeSnippet,
} from "@/modules/bugs-caught/lib/parse-findings"
import { FindingSnippets } from "@/modules/bugs-caught/components/code-snippet"
import { SeverityBadge } from "@/modules/bugs-caught/components/severity-badge"

export const dynamic = "force-dynamic"

function withPathLanguage(snippets: CodeSnippet[], filePath: string): CodeSnippet[] {
  return snippets.map((s) => {
    if (s.language && s.language !== "text") return s
    const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
    if (!ext) return s
    return { ...s, language: ext }
  })
}

export default async function BugDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await requireAuth()

  const review = await prisma.review.findFirst({
    where: {
      id,
      repository: { userId: session.user.id },
    },
    include: {
      repository: {
        select: { fullName: true },
      },
    },
  })

  if (!review) notFound()

  const section = extractFindingsSection(review.review)
  const parsedFindings = parseFindings(section).map((f) => ({
    ...f,
    snippets: withPathLanguage(f.snippets, f.filePath),
  }))

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background p-4 pt-8 md:p-8">
      <div className="mb-8 flex items-start gap-4">
        <Link
          href="/dashboard/bugs-caught"
          className={cn(
            "mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground",
            "transition-[transform,color,background-color] duration-160 ease-out",
            "active:scale-[0.97]",
            "supports-[hover:hover]:hover:bg-muted supports-[hover:hover]:hover:text-foreground",
          )}
          aria-label="Back to bugs caught"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-medium tracking-tight text-foreground">
            #{review.prNumber} {review.prTitle}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground/50">
              {review.repository.fullName}
            </span>
            <span className="text-xs text-muted-foreground/50">
              {formatDistanceToNow(new Date(review.updatedAt), {
                addSuffix: true,
              })}
            </span>
            <a
              href={review.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 transition-colors duration-150 ease-out supports-[hover:hover]:hover:text-muted-foreground"
            >
              View on GitHub <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-medium tracking-tight text-foreground">
            Findings
          </h2>
          {parsedFindings.length > 0 ? (
            <span className="text-[11px] text-muted-foreground/50">
              {parsedFindings.length} issue
              {parsedFindings.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {parsedFindings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground/70">
              No structured findings found in this review.
            </p>
          </div>
        ) : (
          <ul className="space-y-10">
            {parsedFindings.map((finding, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 shrink-0 text-muted-foreground/35">•</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={finding.severity} />
                    <span className="text-sm font-medium text-foreground underline decoration-muted-foreground/25 underline-offset-2">
                      {finding.title}
                    </span>
                    {finding.filePath ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground/45">
                        <span aria-hidden>—</span>
                        <FileCode2 className="size-3 opacity-70" />
                        <span className="truncate">{finding.filePath}</span>
                      </span>
                    ) : null}
                  </div>
                  {finding.description ? (
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground/70">
                      {finding.description}
                    </p>
                  ) : null}
                  <FindingSnippets
                    snippets={finding.snippets}
                    filePath={finding.filePath}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
