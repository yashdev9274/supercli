"use server"

import { auth } from "@/lib/auth"
import prisma from "@super/db"
import { fetchUserContribution, getGithubToken, isGithubReauthRequiredError } from "@/modules/github/lib/github"
import { headers } from "next/headers"
import { Octokit } from "octokit"

export interface DailyMetric {
  date: string
  value: number
}

export interface ContributorMetric {
  login: string
  avatarUrl: string
  prs: number
}

export interface Anomaly {
  id: string
  type: "spike" | "drop" | "trend_break" | "stale"
  metric: string
  severity: "critical" | "warning" | "info"
  message: string
  value: number
  expected: number
  date: string
}

interface SearchPr {
  created_at: string
  merged_at?: string | null
  title: string
  state: string
  number: number
  repository_url: string
  labels?: Array<{ name?: string }>
  user?: { login?: string; avatar_url?: string } | null
}

interface ReactionItem {
  content: string
}

export interface SynthesisReport {
  period: string
  summary: string
  highlights: string[]
  metrics: {
    label: string
    value: string
    trend: "up" | "down" | "flat"
  }[]
}

export type Timeframe = "1m" | "2w" | "1q" | "1y"

export interface RepoOption {
  owner: string
  name: string
  fullName: string
}

export interface AnalyticsData {
  prsReviewed: DailyMetric[]
  bugsCaught: DailyMetric[]
  avgTimeToMerge: DailyMetric[]
  topContributors: ContributorMetric[]
  addressedRate: DailyMetric[]
  commentRatings: { upvotes: number; downvotes: number }
  anomalies: Anomaly[]
  synthesis: SynthesisReport
  timeframe: Timeframe
}

function daysForTimeframe(tf: Timeframe): number {
  switch (tf) {
    case "2w": return 14
    case "1q": return 90
    case "1y": return 365
    case "1m":
    default: return 30
  }
}

function labelForTimeframe(tf: Timeframe): string {
  switch (tf) {
    case "2w": return "Last 14 days"
    case "1q": return "Last quarter"
    case "1y": return "Last year"
    case "1m":
    default: return "Last 30 days"
  }
}

async function getOctokitAndUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    throw new Error("Unauthorized")
  }

  const token = await getGithubToken()
  const octokit = new Octokit({ auth: token })
  const { data: user } = await octokit.rest.users.getAuthenticated()

  return { octokit, user, token }
}

export async function getConnectedRepos(): Promise<RepoOption[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")

  const repos = await prisma.repository.findMany({
    where: { userId: session.user.id },
    select: { name: true, owner: true, fullName: true },
    orderBy: { updatedAt: "desc" },
  })

  return repos.map((r: { owner: string; name: string; fullName: string }) => ({
    owner: r.owner,
    name: r.name,
    fullName: r.fullName,
  }))
}

function generateDailyDates(days: number): string[] {
  const dates: string[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().split("T")[0])
  }
  return dates
}

function detectAnomalies(
  prsReviewed: DailyMetric[],
  bugsCaught: DailyMetric[],
  avgTimeToMerge: DailyMetric[],
  addressedRate: DailyMetric[]
): Anomaly[] {
  const anomalies: Anomaly[] = []

  const detectSpike = (data: DailyMetric[], metricName: string) => {
    if (data.length < 7) return
    const recent = data.slice(-7)
    const older = data.slice(-14, -7)
    if (older.length === 0) return

    const recentAvg = recent.reduce((s, d) => s + d.value, 0) / recent.length
    const olderAvg = older.reduce((s, d) => s + d.value, 0) / older.length || 1

    if (recentAvg > olderAvg * 1.5 && recentAvg > 2) {
      anomalies.push({
        id: `spike-${metricName}`,
        type: "spike",
        metric: metricName,
        severity: recentAvg > olderAvg * 2 ? "critical" : "warning",
        message: `${metricName} increased ${Math.round(((recentAvg - olderAvg) / olderAvg) * 100)}% vs previous week`,
        value: Math.round(recentAvg * 10) / 10,
        expected: Math.round(olderAvg * 10) / 10,
        date: data[data.length - 1].date,
      })
    }

    if (recentAvg < olderAvg * 0.5 && olderAvg > 2) {
      anomalies.push({
        id: `drop-${metricName}`,
        type: "drop",
        metric: metricName,
        severity: recentAvg < olderAvg * 0.25 ? "critical" : "warning",
        message: `${metricName} dropped ${Math.round(((olderAvg - recentAvg) / olderAvg) * 100)}% vs previous week`,
        value: Math.round(recentAvg * 10) / 10,
        expected: Math.round(olderAvg * 10) / 10,
        date: data[data.length - 1].date,
      })
    }
  }

  detectSpike(prsReviewed, "PRs Reviewed")
  detectSpike(bugsCaught, "Bugs Caught")
  detectSpike(avgTimeToMerge, "Avg Time to Merge")

  const recentBugs = bugsCaught.slice(-3)
  const recentPRs = prsReviewed.slice(-3)
  if (recentBugs.length > 0 && recentPRs.length > 0) {
    const bugRate =
      recentBugs.reduce((s, d) => s + d.value, 0) /
      (recentPRs.reduce((s, d) => s + d.value, 0) || 1)
    if (bugRate > 0.3) {
      anomalies.push({
        id: "high-bug-rate",
        type: "trend_break",
        metric: "Bug Rate",
        severity: "critical",
        message: `High bug detection rate: ${Math.round(bugRate * 100)}% of PRs have bugs`,
        value: Math.round(bugRate * 100),
        expected: 15,
        date: recentBugs[recentBugs.length - 1]?.date || new Date().toISOString().split("T")[0],
      })
    }
  }

  const staleCheck = prsReviewed.slice(-5)
  if (staleCheck.every((d) => d.value === 0) && prsReviewed.length >= 5) {
    anomalies.push({
      id: "stale-reviews",
      type: "stale",
      metric: "PR Reviews",
      severity: "info",
      message: "No PRs reviewed in the last 5 days",
      value: 0,
      expected: 3,
      date: staleCheck[staleCheck.length - 1].date,
    })
  }

  return anomalies
}

function generateSynthesis(
  prsReviewed: DailyMetric[],
  bugsCaught: DailyMetric[],
  avgTimeToMerge: DailyMetric[],
  topContributors: ContributorMetric[],
  addressedRate: DailyMetric[],
  commentRatings: { upvotes: number; downvotes: number },
  timeframe: Timeframe
): SynthesisReport {
  const totalPRs = prsReviewed.reduce((s, d) => s + d.value, 0)
  const totalBugs = bugsCaught.reduce((s, d) => s + d.value, 0)
  const avgMergeTime =
    avgTimeToMerge.reduce((s, d) => s + d.value, 0) / (avgTimeToMerge.length || 1)
  const avgAddressed =
    addressedRate.reduce((s, d) => s + d.value, 0) / (addressedRate.length || 1)

  const recentPRs = prsReviewed.slice(-7)
  const olderPRs = prsReviewed.slice(-14, -7)
  const prTrend =
    recentPRs.reduce((s, d) => s + d.value, 0) >=
    olderPRs.reduce((s, d) => s + d.value, 0)
      ? "up"
      : "down"

  const recentBugs = bugsCaught.slice(-7)
  const olderBugs = bugsCaught.slice(-14, -7)
  const bugTrend =
    recentBugs.reduce((s, d) => s + d.value, 0) <=
    olderBugs.reduce((s, d) => s + d.value, 0)
      ? "up"
      : "down"

  const highlights: string[] = []
  if (totalPRs > 0) highlights.push(`${totalPRs} PRs reviewed this period`)
  if (totalBugs > 0) highlights.push(`${totalBugs} issues detected across codebase`)
  if (topContributors.length > 0)
    highlights.push(`Top contributor: ${topContributors[0].login} (${topContributors[0].prs} PRs)`)
  if (avgAddressed > 0) highlights.push(`${Math.round(avgAddressed)}% comment addressed rate`)

  const summary = `Reviewed ${totalPRs} pull requests, caught ${totalBugs} bugs, and analyzed ${topContributors.length} contributors. Average merge time is ${avgMergeTime.toFixed(1)} days with a ${Math.round(avgAddressed)}% comment addressed rate.`

  return {
    period: labelForTimeframe(timeframe),
    summary,
    highlights,
    metrics: [
      { label: "PRs Reviewed", value: String(totalPRs), trend: prTrend },
      {
        label: "Bugs Caught",
        value: String(totalBugs),
        trend: bugTrend,
      },
      {
        label: "Avg Merge Time",
        value: `${avgMergeTime.toFixed(1)}d`,
        trend: avgMergeTime < 2 ? "up" : "down",
      },
      {
        label: "Addressed Rate",
        value: `${Math.round(avgAddressed)}%`,
        trend: avgAddressed > 50 ? "up" : "down",
      },
      {
        label: "Comment Score",
        value:
          commentRatings.upvotes + commentRatings.downvotes > 0
            ? `${commentRatings.upvotes}↑ ${commentRatings.downvotes}↓`
            : "N/A",
        trend: "flat",
      },
    ],
  }
}

export async function getAnalyticsData(timeframe: Timeframe = "1m", repo: string | null = null): Promise<AnalyticsData> {
  try {
    const { octokit, user, token } = await getOctokitAndUser()
    const days = daysForTimeframe(timeframe)
    const dates = generateDailyDates(days)

    const repoFilter = repo ? ` repo:${repo}` : ""
    const { data: allPRs } = await octokit.rest.search.issuesAndPullRequests({
      q: `type:pr created:>=${dates[0]}${repoFilter}`,
      per_page: 100,
      sort: "created",
      order: "desc",
    })

    const prsReviewed: DailyMetric[] = dates.map((date) => ({
      date,
      value: allPRs.items.filter((pr: SearchPr) => {
        const created = new Date(pr.created_at).toISOString().split("T")[0]
        return created === date
      }).length,
    }))

    const bugsCaught: DailyMetric[] = dates.map((date) => ({
      date,
      value: allPRs.items.filter((pr: SearchPr) => {
        const created = new Date(pr.created_at).toISOString().split("T")[0]
        const isBug =
          pr.labels?.some(
            (l: { name?: string }) =>
              l.name?.toLowerCase().includes("bug") ||
              l.name?.toLowerCase().includes("issue") ||
              l.name?.toLowerCase().includes("fix")
          ) ||
          pr.title?.toLowerCase().includes("fix") ||
          pr.title?.toLowerCase().includes("bug")
        return created === date && isBug
      }).length,
    }))

    const avgTimeToMerge: DailyMetric[] = dates.map((date) => {
      const dayPRs = allPRs.items.filter((pr: SearchPr) => {
        const created = new Date(pr.created_at).toISOString().split("T")[0]
        return created === date && pr.merged_at
      })

      if (dayPRs.length === 0) return { date, value: 0 }

      const avgHours =
        dayPRs.reduce((sum: number, pr: SearchPr) => {
          const created = new Date(pr.created_at).getTime()
          const merged = new Date(pr.merged_at ?? "").getTime()
          return sum + (merged - created) / (1000 * 60 * 60)
        }, 0) / dayPRs.length

      return { date, value: Math.round((avgHours / 24) * 10) / 10 }
    })

    const contributorMap: Record<string, { login: string; avatarUrl: string; prs: number }> = {}
    allPRs.items.forEach((pr: SearchPr) => {
      const login = pr.user?.login || "unknown"
      const avatarUrl = pr.user?.avatar_url || ""
      if (!contributorMap[login]) {
        contributorMap[login] = { login, avatarUrl, prs: 0 }
      }
      contributorMap[login].prs++
    })

    const topContributors = Object.values(contributorMap)
      .sort((a, b) => b.prs - a.prs)
      .slice(0, 10)

    const addressedRate: DailyMetric[] = dates.map((date) => {
      const dayPRs = allPRs.items.filter((pr: SearchPr) => {
        const created = new Date(pr.created_at).toISOString().split("T")[0]
        return created === date
      })
      if (dayPRs.length === 0) return { date, value: 0 }
      const addressed = dayPRs.filter(
        (pr: SearchPr) => pr.state === "closed" || pr.merged_at
      ).length
      return { date, value: Math.round((addressed / dayPRs.length) * 100) }
    })

    let totalUpvotes = 0
    let totalDownvotes = 0
    for (const pr of allPRs.items.slice(0, 20)) {
      try {
        const { data: reactions } = await octokit.rest.reactions.listForIssue({
          owner: user.login,
          repo: pr.repository_url.split("/").pop() || "",
          issue_number: pr.number,
        })
        totalUpvotes += reactions.filter(
          (r: ReactionItem) => r.content === "+1" || r.content === "heart"
        ).length
        totalDownvotes += reactions.filter(
          (r: ReactionItem) => r.content === "-1"
        ).length
      } catch {
        // reactions API may not be available for all repos
      }
    }

    const anomalies = detectAnomalies(
      prsReviewed,
      bugsCaught,
      avgTimeToMerge,
      addressedRate
    )

    const synthesis = generateSynthesis(
      prsReviewed,
      bugsCaught,
      avgTimeToMerge,
      topContributors,
      addressedRate,
      { upvotes: totalUpvotes, downvotes: totalDownvotes },
      timeframe
    )

    return {
      prsReviewed,
      bugsCaught,
      avgTimeToMerge,
      topContributors,
      addressedRate,
      commentRatings: { upvotes: totalUpvotes, downvotes: totalDownvotes },
      anomalies,
      synthesis,
      timeframe,
    }
  } catch (error) {
    if (!isGithubReauthRequiredError(error)) {
      console.error("Error fetching analytics data:", error)
    } else {
      console.warn("GitHub reauth required while fetching analytics data")
    }

    const dates = generateDailyDates(30)
    const empty: DailyMetric[] = dates.map((date) => ({ date, value: 0 }))

    return {
      prsReviewed: empty,
      bugsCaught: empty,
      avgTimeToMerge: empty,
      topContributors: [],
      addressedRate: empty,
      commentRatings: { upvotes: 0, downvotes: 0 },
      anomalies: [],
      synthesis: {
        period: labelForTimeframe(timeframe),
        summary: isGithubReauthRequiredError(error)
          ? "GitHub authorization expired. Reconnect GitHub to load analytics."
          : "No data available yet. Connect your GitHub repositories to see analytics.",
        highlights: [],
        metrics: [],
      },
      timeframe,
    }
  }
}
