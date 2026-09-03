"use server"

import { auth } from "@/lib/auth";
import prisma from "@super/db";
import { reviewPullRequest } from "@/modules/ai/action";
import { fetchUserContribution, getGithubToken, getGithubAuthStatus, isGithubReauthRequiredError } from "@/modules/github/lib/github";
import { headers } from "next/headers";
import { Octokit } from "octokit";

export async function getDashboardStats() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})
        
        // to get users github username

        const {data: user} = await octokit.rest.users.getAuthenticated()

        const totalRepos = await prisma.repository.count({
            where: { userId: session.user.id },
        })

        const calendar = await fetchUserContribution(token, user.login)
        const totalCommits = calendar?.totalContributions || 0

        const {data:prs} = await octokit.rest.search.issuesAndPullRequests({
            q: `author:${user.login} type:pr`,
            per_page:1 
        })

        const totalPRs = prs.total_count

        const toatalReviews = await prisma.review.count({
            where: {
                repository: { userId: session.user.id },
                status: "completed",
            },
        })

        return{
            totalCommits,
            totalPRs,
            toatalReviews,
            totalRepos
        }

    } catch (error) {
        if (!isGithubReauthRequiredError(error)) {
            console.error("Error in fetching dashbaord stats: ", error);
        } else {
            console.warn("GitHub reauth required while fetching dashbaord stats");
        }
        return{
            totalCommits:0,
            totalPRs:0,
            toatalReviews : 0, 
            totalRepos :0,
        }
        
    }
}

export async function getMontlyActivity(){
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})

        const {data: user} = await octokit.rest.users.getAuthenticated()

        const calendar = await fetchUserContribution(token, user.login)

        if(!calendar){
            return []
        }

        const monthlyData:{
            [key:string] : {commits: number; prs: number; reviews: number}
        }={}

        const monthNames=[
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
        ]

        const present = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(present.getFullYear(), present.getMonth() - i, 1);
            const monthKey = monthNames[date.getMonth()];
            monthlyData[monthKey] = { commits: 0, prs: 0, reviews: 0 };
          }
          
          calendar.weeks.forEach((week: any) => {
            week.contributionDays.forEach((day: any) => {
              const date = new Date(day.date);
              const monthKey = monthNames[date.getMonth()];
              if (monthlyData[monthKey]) {
                monthlyData[monthKey].commits += day.contributionCount;
              }
            })
          })

          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6)
          

          const generateSampleReviews = () => {
            const sampleReviews = [];
            const now = new Date();
          
            // Generate random reviews over the past 6 months
            for (let i = 0; i < 45; i++) {
              const randomDaysAgo = Math.floor(Math.random() * 180); // Random day in last 6 months
              const reviewDate = new Date(now);
              reviewDate.setDate(reviewDate.getDate() - randomDaysAgo);
          
              sampleReviews.push({
                createdAt: reviewDate,
              });
            }
          
            return sampleReviews;
          }

    const reviews = generateSampleReviews()

    reviews.forEach((review)=>{
        const monthKey = monthNames[review.createdAt.getMonth()];
        if(monthlyData[monthKey]){
            monthlyData[monthKey].reviews+=1
        }
    })

          const {data:prs} = await octokit.rest.search.issuesAndPullRequests({
            q: `author:${user.login} type:pr created:>=${
                sixMonthsAgo.toISOString().split("T")[0]
            }`,
            per_page:100
        })

    prs.items.forEach((pr: any)=>{
        const date = new Date(pr.created_at)
        const monthKey = monthNames[date.getMonth()]
        if(monthlyData[monthKey]){
            monthlyData[monthKey].prs+=1
        }
    })

    return Object.keys(monthlyData).map((name) => ({
        name,
        ...monthlyData[name]
    }));
          
    } catch (error) {
        if (!isGithubReauthRequiredError(error)) {
            console.log("Error in fetching montly activity:", error)
        } else {
            console.warn("GitHub reauth required while fetching montly activity")
        }
        return [];
        
    }
}


export async function getContributionStats(){
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        
        if (!session?.user) {
            throw new Error("Unauthorized");
        }
        
        const token = await getGithubToken();
        const octokit = new Octokit({auth:token})

        const {data: user} = await octokit.rest.users.getAuthenticated()
        const username = user.login
        const calendar = await fetchUserContribution(token, username)

        if(!calendar){
            return null
        }

        // First flatten raw contributions so we can compute levels relative to the max count.
        const rawContributions: { date: string; count: number }[] =
            calendar.weeks.flatMap((week: any) =>
                week.contributionDays.map((day: any) => ({
                    date: day.date,
                    count: day.contributionCount,
                }))
            )

        const maxCount = rawContributions.reduce(
            (max: number, day) => (day.count > max ? day.count : max),
            0
        )

        // Map counts to levels 0–4 (what react-activity-calendar expects).
        const contributions = rawContributions.map((day) => {
            if (day.count === 0 || maxCount === 0) {
                return { ...day, level: 0 }
            }

            const ratio = day.count / maxCount
            let level = 1

            if (ratio > 0.75) level = 4
            else if (ratio > 0.5) level = 3
            else if (ratio > 0.25) level = 2

            return { ...day, level }
        })

        return{
            contributions,
            totalContributions: calendar.totalContributions
        }

    } catch (error) {
        if (!isGithubReauthRequiredError(error)) {
            if (!isGithubReauthRequiredError(error)) {
            if (!isGithubReauthRequiredError(error)) {
            console.error("Error in fetching user contribution stats:", error);
        } else {
            console.warn("GitHub reauth required while fetching contribution stats");
        }
        } else {
            console.warn("GitHub reauth required while fetching contribution stats");
        }
        } else {
            console.warn("GitHub reauth required while fetching contribution stats");
        }
        return null;
    }
}

export type ReviewItem = {
    id: string
    prNumber: number
    prTitle: string
    prUrl: string
    status: string
    createdAt: Date
    updatedAt?: Date
    summary?: string
    prState?: "open" | "closed" | "merged"
    repository: {
        name: string
        fullName: string
        owner: string
    }
}

export type ReviewDetail = ReviewItem & {
    review: string
    author?: string
    authorName?: string
    authorAvatar?: string
    body?: string
    additions?: number
    deletions?: number
    changedFiles?: number
    baseRef?: string
    headRef?: string
}

export type PrDiffFile = {
    filename: string
    previousFilename?: string
    status: string
    additions: number
    deletions: number
    changes: number
    patch?: string
    blobUrl?: string
    rawUrl?: string
}

/** Encode a stable detail-page id for PRs that may not have a DB review yet.
 * Format: owner__repo__prNumber (no slashes — safe as a single path segment).
 * Kept private: "use server" modules can only export async actions.
 */
function encodePrDetailId(fullName: string, prNumber: number) {
    const [owner, ...rest] = fullName.split("/")
    const repo = rest.join("/")
    return `${owner}__${repo}__${prNumber}`
}

function parsePrDetailId(id: string): { fullName: string; prNumber: number } | null {
    // Prefer owner__repo__number (new format)
    const parts = id.split("__")
    if (parts.length >= 3) {
        const prNumber = Number(parts[parts.length - 1])
        const owner = parts[0]
        const repo = parts.slice(1, -1).join("__")
        if (owner && repo && Number.isFinite(prNumber) && prNumber > 0) {
            return { fullName: `${owner}/${repo}`, prNumber }
        }
    }

    // Legacy: owner/repo__number
    const sep = id.lastIndexOf("__")
    if (sep <= 0) return null
    const fullName = id.slice(0, sep)
    const prNumber = Number(id.slice(sep + 2))
    if (!fullName.includes("/") || !Number.isFinite(prNumber) || prNumber <= 0) return null
    return { fullName, prNumber }
}

function snippet(text: string, max = 180) {
    const cleaned = text.replace(/\s+/g, " ").trim()
    if (cleaned.length <= max) return cleaned
    return `${cleaned.slice(0, max).trimEnd()}…`
}

function extractSummary(reviewMarkdown: string) {
    // Prefer an explicit Summary / Overview section when present
    const section =
        reviewMarkdown.match(
            /(?:^|\n)#{1,3}\s*(?:summary|overview|tl;dr)\s*\n+([\s\S]*?)(?=\n#{1,3}\s|\n---|$)/i,
        )?.[1] ?? reviewMarkdown

    return snippet(section)
}

export async function getReviews(repoFullName?: string): Promise<ReviewItem[]> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })

        if (!session?.user) {
            throw new Error("Unauthorized")
        }

        const repos = await prisma.repository.findMany({
            where: {
                userId: session.user.id,
                ...(repoFullName ? { fullName: repoFullName } : {}),
            },
            select: {
                id: true,
                name: true,
                fullName: true,
                owner: true,
            },
            orderBy: { updatedAt: "desc" },
            take: repoFullName ? 1 : 20,
        })

        if (repos.length === 0) return []

        const repoIds = repos.map((r) => r.id)
        const storedReviews = await prisma.review.findMany({
            where: { repositoryId: { in: repoIds } },
            orderBy: { updatedAt: "desc" },
        })

        const reviewByKey = new Map(
            storedReviews.map((r) => [`${r.repositoryId}:${r.prNumber}`, r]),
        )

        let token: string | null = null
        try {
            token = await getGithubToken()
        } catch {
            token = null
        }

        // Prefer live GitHub PRs for the selected repo(s), merged with stored review status.
        if (token) {
            const octokit = new Octokit({ auth: token })
            const items: ReviewItem[] = []

            // Limit concurrency a bit — selected repo is usually one; all-repos is small.
            for (const repo of repos) {
                try {
                    const { data: pulls } = await octokit.rest.pulls.list({
                        owner: repo.owner,
                        repo: repo.name,
                        state: "all",
                        sort: "updated",
                        direction: "desc",
                        per_page: repoFullName ? 30 : 10,
                    })

                    for (const pr of pulls) {
                        const stored = reviewByKey.get(`${repo.id}:${pr.number}`)
                        const prState: ReviewItem["prState"] = pr.merged_at
                            ? "merged"
                            : pr.state === "closed"
                                ? "closed"
                                : "open"

                        items.push({
                            // Always use a path-safe encoded id so the detail route is stable
                            id: encodePrDetailId(repo.fullName, pr.number),
                            prNumber: pr.number,
                            prTitle: pr.title,
                            prUrl: pr.html_url,
                            status: stored?.status ?? "unreviewed",
                            createdAt: new Date(pr.updated_at ?? pr.created_at),
                            updatedAt: new Date(pr.updated_at ?? pr.created_at),
                            summary: stored ? extractSummary(stored.review) : (pr.body ? snippet(pr.body) : undefined),
                            prState,
                            repository: {
                                name: repo.name,
                                fullName: repo.fullName,
                                owner: repo.owner,
                            },
                        })
                    }
                } catch (error) {
                    console.error(`Error listing PRs for ${repo.fullName}:`, error)
                }
            }

            // Include any stored reviews that didn't show up in the GitHub window
            for (const stored of storedReviews) {
                const repo = repos.find((r) => r.id === stored.repositoryId)
                if (!repo) continue
                const already = items.some(
                    (i) =>
                        i.repository.fullName === repo.fullName &&
                        i.prNumber === stored.prNumber,
                )
                if (already) continue
                items.push({
                    id: encodePrDetailId(repo.fullName, stored.prNumber),
                    prNumber: stored.prNumber,
                    prTitle: stored.prTitle,
                    prUrl: stored.prUrl,
                    status: stored.status,
                    createdAt: stored.createdAt,
                    updatedAt: stored.updatedAt,
                    summary: extractSummary(stored.review),
                    repository: {
                        name: repo.name,
                        fullName: repo.fullName,
                        owner: repo.owner,
                    },
                })
            }

            // Auto-queue open unreviewed PRs. reviewPullRequest returns immediately
            // (Inngest or next/server after()) so the list stays fast.
            // Cap concurrent queues per list load to avoid stampeding LLM spend.
            const toQueue = items
                .filter(
                    (item) =>
                        item.prState === "open" &&
                        item.status === "unreviewed",
                )
                .slice(0, repoFullName ? 5 : 2)

            if (toQueue.length > 0) {
                const queuedKeys = new Set<string>()
                await Promise.allSettled(
                    toQueue.map(async (item) => {
                        const key = `${item.repository.fullName}#${item.prNumber}`
                        if (queuedKeys.has(key)) return
                        queuedKeys.add(key)
                        try {
                            await reviewPullRequest(
                                item.repository.owner,
                                item.repository.name,
                                item.prNumber,
                                {
                                    userId: session.user.id,
                                    prTitle: item.prTitle,
                                },
                            )
                            item.status = "pending"
                            item.summary = item.summary ?? "AI review queued…"
                        } catch (error) {
                            console.error(
                                `[getReviews] auto-queue failed for ${key}:`,
                                error,
                            )
                        }
                    }),
                )
            }

            return items.sort(
                (a, b) =>
                    new Date(b.updatedAt ?? b.createdAt).getTime() -
                    new Date(a.updatedAt ?? a.createdAt).getTime(),
            )
        }

        // Fallback: DB-only when GitHub token is unavailable
        return storedReviews.map((r) => {
            const repo = repos.find((repo) => repo.id === r.repositoryId)!
            return {
                id: encodePrDetailId(repo.fullName, r.prNumber),
                prNumber: r.prNumber,
                prTitle: r.prTitle,
                prUrl: r.prUrl,
                status: r.status,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
                summary: extractSummary(r.review),
                repository: {
                    name: repo.name,
                    fullName: repo.fullName,
                    owner: repo.owner,
                },
            }
        })
    } catch (error) {
        console.error("Error fetching reviews:", error)
        return []
    }
}

export async function getReview(id: string): Promise<ReviewDetail | null> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })

        if (!session?.user) {
            throw new Error("Unauthorized")
        }

        // 1) Direct DB review id
        const byId = await prisma.review.findFirst({
            where: {
                id,
                repository: { userId: session.user.id },
            },
            include: { repository: { select: { name: true, fullName: true, owner: true } } },
        })

        type PrMeta = {
            title: string
            html_url: string
            body: string | null
            userLogin?: string
            userName?: string
            userAvatar?: string
            state: string
            merged_at: string | null
            updated_at: string
            created_at: string
            additions?: number
            deletions?: number
            changed_files?: number
            baseRef?: string
            headRef?: string
        }

        async function fetchPrMeta(
            owner: string,
            repo: string,
            prNumber: number,
        ): Promise<PrMeta | null> {
            try {
                const token = await getGithubToken()
                const octokit = new Octokit({ auth: token })
                const { data: pr } = await octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number: prNumber,
                })
                return {
                    title: pr.title,
                    html_url: pr.html_url,
                    body: pr.body,
                    userLogin: pr.user?.login,
                    userName: pr.user?.name ?? undefined,
                    userAvatar: pr.user?.avatar_url ?? undefined,
                    state: pr.state,
                    merged_at: pr.merged_at,
                    updated_at: pr.updated_at,
                    created_at: pr.created_at,
                    additions: pr.additions,
                    deletions: pr.deletions,
                    changed_files: pr.changed_files,
                    baseRef: pr.base?.ref,
                    headRef: pr.head?.ref,
                }
            } catch (error) {
                console.error("Error fetching PR metadata:", error)
                return null
            }
        }

        if (byId) {
            const prMeta = await fetchPrMeta(
                byId.repository.owner,
                byId.repository.name,
                byId.prNumber,
            )
            const prState: ReviewItem["prState"] = prMeta?.merged_at
                ? "merged"
                : prMeta?.state === "closed"
                    ? "closed"
                    : prMeta
                        ? "open"
                        : undefined

            return {
                ...byId,
                summary: extractSummary(byId.review),
                prState,
                author: prMeta?.userLogin,
                authorName: prMeta?.userName,
                authorAvatar: prMeta?.userAvatar,
                body: prMeta?.body ?? undefined,
                additions: prMeta?.additions,
                deletions: prMeta?.deletions,
                changedFiles: prMeta?.changed_files,
                baseRef: prMeta?.baseRef,
                headRef: prMeta?.headRef,
                prTitle: prMeta?.title || byId.prTitle,
                prUrl: prMeta?.html_url || byId.prUrl,
            }
        }

        // 2) Encoded owner__repo__number — join live PR metadata with any stored review
        const parsed = parsePrDetailId(id)
        if (!parsed) return null

        const repository = await prisma.repository.findFirst({
            where: {
                userId: session.user.id,
                fullName: parsed.fullName,
            },
            select: { id: true, name: true, fullName: true, owner: true },
        })

        if (!repository) return null

        const stored = await prisma.review.findFirst({
            where: {
                repositoryId: repository.id,
                prNumber: parsed.prNumber,
            },
        })

        const prMeta = await fetchPrMeta(
            repository.owner,
            repository.name,
            parsed.prNumber,
        )

        if (!stored && !prMeta) return null

        const prState: ReviewItem["prState"] = prMeta?.merged_at
            ? "merged"
            : prMeta?.state === "closed"
                ? "closed"
                : prMeta
                    ? "open"
                    : undefined

        const reviewText = stored?.review ?? ""
        const title = stored?.prTitle || prMeta?.title || `PR #${parsed.prNumber}`
        const prUrl =
            stored?.prUrl ||
            prMeta?.html_url ||
            `https://github.com/${repository.fullName}/pull/${parsed.prNumber}`

        return {
            id: stored?.id ?? id,
            prNumber: parsed.prNumber,
            prTitle: title,
            prUrl,
            status: stored?.status ?? "unreviewed",
            createdAt: stored?.createdAt ?? new Date(prMeta?.created_at ?? Date.now()),
            updatedAt: stored?.updatedAt ?? new Date(prMeta?.updated_at ?? Date.now()),
            review: reviewText,
            summary: reviewText
                ? extractSummary(reviewText)
                : prMeta?.body
                    ? snippet(prMeta.body)
                    : undefined,
            prState,
            author: prMeta?.userLogin,
            authorName: prMeta?.userName,
            authorAvatar: prMeta?.userAvatar,
            body: prMeta?.body ?? undefined,
            additions: prMeta?.additions,
            deletions: prMeta?.deletions,
            changedFiles: prMeta?.changed_files,
            baseRef: prMeta?.baseRef,
            headRef: prMeta?.headRef,
            repository: {
                name: repository.name,
                fullName: repository.fullName,
                owner: repository.owner,
            },
        }
    } catch (error) {
        console.error("Error fetching review:", error)
        return null
    }
}

/** Resolve owner/repo/prNumber from a detail id (DB uuid or encoded path id). */
async function resolvePrIdentity(
    id: string,
    userId: string,
): Promise<{ owner: string; repo: string; prNumber: number; fullName: string } | null> {
    const byId = await prisma.review.findFirst({
        where: {
            id,
            repository: { userId },
        },
        include: {
            repository: { select: { owner: true, name: true, fullName: true } },
        },
    })
    if (byId) {
        return {
            owner: byId.repository.owner,
            repo: byId.repository.name,
            prNumber: byId.prNumber,
            fullName: byId.repository.fullName,
        }
    }

    const parsed = parsePrDetailId(id)
    if (!parsed) return null

    const repository = await prisma.repository.findFirst({
        where: {
            userId,
            fullName: parsed.fullName,
        },
        select: { owner: true, name: true, fullName: true },
    })
    if (!repository) return null

    return {
        owner: repository.owner,
        repo: repository.name,
        prNumber: parsed.prNumber,
        fullName: repository.fullName,
    }
}

/** List changed files + patches for the Diff tab. */
export async function getPrDiffFiles(id: string): Promise<PrDiffFile[]> {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        })
        if (!session?.user) throw new Error("Unauthorized")

        const identity = await resolvePrIdentity(id, session.user.id)
        if (!identity) return []

        const token = await getGithubToken()
        const octokit = new Octokit({ auth: token })

        const files: PrDiffFile[] = []
        let page = 1
        while (page <= 5) {
            const { data } = await octokit.rest.pulls.listFiles({
                owner: identity.owner,
                repo: identity.repo,
                pull_number: identity.prNumber,
                per_page: 100,
                page,
            })
            if (data.length === 0) break
            for (const f of data) {
                files.push({
                    filename: f.filename,
                    previousFilename: f.previous_filename ?? undefined,
                    status: f.status,
                    additions: f.additions,
                    deletions: f.deletions,
                    changes: f.changes,
                    patch: f.patch ?? undefined,
                    blobUrl: f.blob_url,
                    rawUrl: f.raw_url,
                })
            }
            if (data.length < 100) break
            page += 1
        }
        return files
    } catch (error) {
        console.error("Error fetching PR diff files:", error)
        return []
    }
}

/**
 * Manually queue (or re-queue) an AI review for a connected-repo PR.
 * Accepts either a DB review id or an encoded owner__repo__prNumber id.
 */
export async function queueReview(id: string): Promise<{ success: boolean; message: string }> {
    const session = await auth.api.getSession({
        headers: await headers(),
    })

    if (!session?.user) {
        throw new Error("Unauthorized")
    }

    let owner: string | null = null
    let repo: string | null = null
    let prNumber: number | null = null

    const byId = await prisma.review.findFirst({
        where: {
            id,
            repository: { userId: session.user.id },
        },
        include: {
            repository: { select: { owner: true, name: true, userId: true } },
        },
    })

    if (byId) {
        owner = byId.repository.owner
        repo = byId.repository.name
        prNumber = byId.prNumber
    } else {
        const parsed = parsePrDetailId(id)
        if (!parsed) {
            throw new Error("Invalid pull request id")
        }

        const repository = await prisma.repository.findFirst({
            where: {
                userId: session.user.id,
                fullName: parsed.fullName,
            },
            select: { owner: true, name: true },
        })

        if (!repository) {
            throw new Error(`Repository ${parsed.fullName} is not connected`)
        }

        owner = repository.owner
        repo = repository.name
        prNumber = parsed.prNumber
    }

    // Async by default: Inngest when configured, otherwise next/server after().
    // Detail page polls until status becomes completed/failed.
    const result = await reviewPullRequest(owner, repo, prNumber, {
        userId: session.user.id,
        source: "dashboard",
    })
    return {
        success: Boolean(result.success),
        message: result.message ?? "Review queued",
    }
}


export async function getGithubConnectionStatus() {
  return getGithubAuthStatus()
}
