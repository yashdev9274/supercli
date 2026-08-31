import prisma from "@super/db"
import { requireAuth } from "@/modules/components/utils/auth-utils"
import { Bug, ExternalLink, FileCode2, Info } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import {
  extractFindingsSection,
  parseFindings,
  severityRank,
  type CodeSnippet,
  type ParsedFinding,
} from "@/modules/bugs-caught/lib/parse-findings"

export const dynamic = "force-dynamic"

type Finding = ParsedFinding & {
  reviewId: string
  prNumber: number
  prTitle: string
  prUrl: string
  repoFullName: string
  updatedAt: Date
}

function withPathLanguage(snippets: CodeSnippet[], filePath: string): CodeSnippet[] {
  return snippets.map((s) => {
    if (s.language && s.language !== "text") return s
    const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
    if (!ext) return s
    return { ...s, language: ext }
  })
}

function SeverityTag({ severity }: { severity: string }) {
  const map: Record<string, { label: string; className: string }> = {
    critical: {
      label: "C",
      className: "bg-red-500/15 text-red-600 border-red-500/20",
    },
    high: {
      label: "H",
      className: "bg-orange-500/15 text-orange-600 border-orange-500/20",
    },
    medium: {
      label: "M",
      className: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
    },
    low: {
      label: "L",
      className: "bg-green-500/15 text-green-600 border-green-500/20",
    },
    info: {
      label: "I",
      className: "bg-blue-500/15 text-blue-600 border-blue-500/20",
    },
  }

  const config = map[severity] ?? map.info

  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-semibold",
        config.className,
      )}
    >
      {config.label}
    </span>
  )
}

function MetricCard({
  label,
  value,
  tooltip,
}: {
  label: string
  value: number
  tooltip?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{value}</span>
      {tooltip && (
        <Info className="h-3.5 w-3.5 text-muted-foreground/40" />
      )}
    </div>
  )
}

export default async function BugsCaughtPage() {
  const session = await requireAuth()

  const reviews = await prisma.review.findMany({
    where: {
      repository: {
        userId: session.user.id,
      },
      status: "completed",
    },
    include: {
      repository: {
        select: {
          fullName: true,
          owner: true,
          name: true,
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 100,
  })

  const findings: Finding[] = []

  for (const review of reviews) {
    const section = extractFindingsSection(review.review)
    const parsed = parseFindings(section)

    if (parsed.length > 0) {
      for (const item of parsed) {
        findings.push({
          ...item,
          snippets: withPathLanguage(item.snippets, item.filePath),
          reviewId: review.id,
          prNumber: review.prNumber,
          prTitle: review.prTitle,
          prUrl: review.prUrl,
          repoFullName: review.repository.fullName,
          updatedAt: review.updatedAt,
        })
      }
      continue
    }

    const reviewLower = review.review.toLowerCase()
    const prTitleLower = review.prTitle.toLowerCase()
    const looksLikeBug =
      reviewLower.includes("bug") ||
      reviewLower.includes("issue") ||
      reviewLower.includes("fix") ||
      reviewLower.includes("error") ||
      reviewLower.includes("vulnerability") ||
      reviewLower.includes("security") ||
      prTitleLower.includes("bug") ||
      prTitleLower.includes("fix") ||
      prTitleLower.includes("issue")

    if (looksLikeBug) {
      findings.push({
        severity: "info",
        title: review.prTitle,
        filePath: review.repository.fullName,
        description: review.review.slice(0, 280).replace(/\s+/g, " ").trim(),
        snippets: [],
        reviewId: review.id,
        prNumber: review.prNumber,
        prTitle: review.prTitle,
        prUrl: review.prUrl,
        repoFullName: review.repository.fullName,
        updatedAt: review.updatedAt,
      })
    }
  }

  findings.sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity)
    if (bySeverity !== 0) return bySeverity
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  const counts = findings.reduce(
    (acc, f) => {
      acc.total += 1
      acc[f.severity] = (acc[f.severity] ?? 0) + 1
      return acc
    },
    { total: 0 } as Record<string, number>,
  )

  const totalPrs = new Set(reviews.map((r) => r.id)).size

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background p-4 pt-8 md:p-8">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/20">
            <Bug className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-2xl font-medium tracking-tight text-foreground">
              Bugs caught
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground/60">
              AI-detected issues from your code reviews
            </p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-8 flex flex-wrap items-center gap-6 rounded-xl border border-border bg-muted/10 px-5 py-3">
        <MetricCard label="Total PRs" value={totalPrs} tooltip />
        <MetricCard label="All bugs" value={counts.total} tooltip />
        <MetricCard label="Critical" value={counts.critical ?? 0} tooltip />
        <MetricCard label="High" value={counts.high ?? 0} tooltip />
        <MetricCard label="Medium" value={counts.medium ?? 0} tooltip />
      </div>

      {findings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 px-6 py-16 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
            <Bug className="h-4 w-4 text-muted-foreground/70" />
          </div>
          <p className="text-sm font-medium text-foreground">No bugs caught yet</p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground/60">
            Structured findings from completed PR reviews show up here. Connect
            repositories and run reviews to start detecting issues.
          </p>
          <Link
            href="/dashboard/providers"
            className={cn(
              "mt-4 inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs text-foreground",
              "transition-transform duration-160 ease-out active:scale-[0.97]",
              "supports-[hover:hover]:hover:bg-muted/30",
            )}
          >
            Connect repositories
          </Link>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-4xl">
          <h2 className="mb-5 text-lg font-medium tracking-tight text-foreground">
            Findings
          </h2>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Bug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Severity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    PR#
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding, i) => (
                  <tr
                    key={`${finding.reviewId}-${i}`}
                    className="border-b border-border/50 last:border-0 supports-[hover:hover]:hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/dashboard/bugs-caught/${finding.reviewId}`}
                          className="text-sm font-medium text-foreground transition-colors duration-150 ease-out supports-[hover:hover]:hover:text-primary"
                        >
                          {finding.title}
                        </Link>
                        {finding.filePath ? (
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground/50">
                            <FileCode2 className="size-3 opacity-70" />
                            <span className="truncate">{finding.filePath}</span>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <SeverityTag severity={finding.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/bugs-caught/${finding.reviewId}`}
                        className="font-mono text-xs text-muted-foreground/70 transition-colors duration-150 ease-out supports-[hover:hover]:hover:text-foreground"
                      >
                        #{finding.prNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground/60">
                        {formatDistanceToNow(new Date(finding.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}