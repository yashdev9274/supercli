import {Octokit} from "octokit"
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { headers } from "next/headers";

export const getGithubToken = async()=>{
    const session = await auth.api.getSession({
        headers: await headers()
    })

    if(!session){
        throw new Error("Unauthorized")
    }

    const account = await prisma.account.findFirst({
        where:{
            userId: session.user.id,
            providerId: "github"
        }
    })

    if(!account?.accessToken){
        throw new Error("No github access token found")
    }

    return account.accessToken;
}

export async function fetchUserContribution(token: string, username: string){
    const octokit = new Octokit({auth: token})

    const query =`
    query($username:String!){
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                color
              }
            }
          }
        }
      }
    }
    `

    // interface contributindata{
    //     user:{
    //         contributionCollection:{
    //             contributionCalendar:{
    //                 totalContributions:number,
    //                 weeks:{
    //                     contributionCount:number,
    //                     data:string | Date,
    //                 }
    //             }
    //         }
    //     }
    // }

    try {
        const response: any = await octokit.graphql(query, {
            username,
        })

        return response.user.contributionsCollection.contributionCalendar
    } catch (error) {
        console.error("Error in fetching contributions:", error)
        return null
    }

  }
  
export const getRepositories = async(page: number=1, per_page=10)=>{

  const token = await getGithubToken();
  const octokit = new Octokit({auth:token})

  const {data} = await octokit.rest.repos.listForAuthenticatedUser({
    per_page,
    page,
    sort: "updated",
    direction: "desc"
  })

  return data
}


export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGithubToken()

  const octokit = new Octokit({ auth: token })

  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.BETTER_AUTH_URL ||
    ""
  ).replace(/\/$/, "")

  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_BASE_URL (or NEXT_PUBLIC_APP_URL) is required to create GitHub webhooks",
    )
  }

  // Localhost webhooks never receive GitHub events — require a public URL.
  if (/localhost|127\.0\.0\.1/i.test(baseUrl)) {
    console.warn(
      `[github] webhook base URL is local (${baseUrl}). GitHub cannot deliver events. Use a tunnel (ngrok/cloudflared) or deploy URL.`,
    )
  }

  const webhookUrl = `${baseUrl}/api/webhooks/github`
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  const { data: hooks } = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
  })

  const existingHook = hooks.find((hook) => {
    const hookUrl = hook.config?.url
    if (!hookUrl) return false
    const normalizedHookUrl = hookUrl.replace(/\/$/, "")
    const normalizedWebhookUrl = webhookUrl.replace(/\/$/, "")
    return normalizedHookUrl === normalizedWebhookUrl
  })

  if (existingHook) {
    // Ensure the hook is active and subscribed to PR events
    try {
      await octokit.rest.repos.updateWebhook({
        owner,
        repo,
        hook_id: existingHook.id,
        active: true,
        events: ["pull_request"],
        config: {
          url: webhookUrl,
          content_type: "json",
          ...(secret ? { secret } : {}),
          insecure_ssl: "0",
        },
      })
    } catch (error) {
      console.error("[github] failed to refresh existing webhook:", error)
    }
    return existingHook
  }

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    active: true,
    config: {
      url: webhookUrl,
      content_type: "json",
      ...(secret ? { secret } : {}),
      insecure_ssl: "0",
    },
    events: ["pull_request"],
  })

  return data
}

export const deleteWebhook = async (owner:string, repo:string)=>{
  const token = await getGithubToken()

  const octokit = new Octokit({auth:token})

  const baseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL?.replace(/\/$/, '')
  const webhookUrl = `${baseUrl}/api/webhooks/github`

  try {
    
    const{data: hooks} = await octokit.rest.repos.listWebhooks({
      owner,
      repo
    })

    const hookToDelete = hooks.find(hook => hook.config.url === webhookUrl)

    if(hookToDelete){
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id:hookToDelete.id
      })
      return true
    }
    return false

  } catch (error) {
   console.error("Error in deleting webhook:", error)
   return false 
  }

}


const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|tar|gz|tgz|bz2|7z|rar|woff2?|ttf|eot|mp[34]|wav|mov|avi|mkv|webm|lock|bin|exe|dll|so|dylib|class|jar|wasm|parquet|pkl|npy|onnx|pt|safetensors)$/i

const SKIP_PATH_SEGMENTS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "__pycache__/",
  ".turbo/",
  "vendor/",
  ".venv/",
  "venv/",
]

const MAX_FILE_BYTES = 200_000

function shouldIndexPath(path: string): boolean {
  if (BINARY_EXTENSIONS.test(path)) return false
  if (path.endsWith(".min.js") || path.endsWith(".min.css")) return false
  if (path.endsWith("bun.lock") || path.endsWith("package-lock.json") || path.endsWith("yarn.lock") || path.endsWith("pnpm-lock.yaml")) {
    return false
  }
  return !SKIP_PATH_SEGMENTS.some((segment) => path.includes(segment))
}

/** List indexable file paths via the Git Trees API (1 request). */
export async function listRepoFilePaths(
  token: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const octokit = new Octokit({ auth: token })

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: ref.object.sha,
    recursive: "true",
  })

  return (tree.tree ?? [])
    .filter((item) => item.type === "blob" && item.path && shouldIndexPath(item.path))
    .filter((item) => !item.size || item.size <= MAX_FILE_BYTES)
    .map((item) => item.path as string)
}

/** Fetch contents for a list of paths (batched Contents API). */
export async function getRepoFileContentsByPaths(
  token: string,
  owner: string,
  repo: string,
  paths: string[],
): Promise<{ path: string; content: string }[]> {
  const octokit = new Octokit({ auth: token })
  const files: { path: string; content: string }[] = []

  // Keep concurrency modest to avoid secondary rate limits
  const concurrency = 8
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
          })

          if (Array.isArray(data) || data.type !== "file" || !("content" in data) || !data.content) {
            return null
          }

          // GitHub Contents API only returns content for files under ~1MB
          if (data.encoding !== "base64") {
            return null
          }

          const content = Buffer.from(data.content, "base64").toString("utf-8")
          // Skip likely-binary / empty
          if (!content.trim()) return null
          if (content.includes("\u0000")) return null

          return { path: data.path, content }
        } catch (error) {
          console.error(`[github] failed to fetch ${path}:`, error)
          return null
        }
      }),
    )

    for (const result of results) {
      if (result) files.push(result)
    }
  }

  return files
}

/** @deprecated Prefer listRepoFilePaths + getRepoFileContentsByPaths for large repos. */
export async function getRepoFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string = "",
): Promise<{ path: string; content: string }[]> {
  // Keep recursive Contents-API path for single-directory callers / tests,
  // but use the tree API for full-repo walks.
  if (path === "") {
    const paths = await listRepoFilePaths(token, owner, repo)
    return getRepoFileContentsByPaths(token, owner, repo, paths)
  }

  const octokit = new Octokit({ auth: token })

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  })

  if (!Array.isArray(data)) {
    if (data.type === "file" && data.content && shouldIndexPath(data.path)) {
      return [{
        path: data.path,
        content: Buffer.from(data.content, "base64").toString("utf-8"),
      }]
    }
    return []
  }

  let files: { path: string; content: string }[] = []

  for (const item of data) {
    if (item.type === "file" && shouldIndexPath(item.path)) {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: item.path,
      })

      if (!Array.isArray(fileData) && fileData.type === "file" && fileData.content) {
        files.push({
          path: item.path,
          content: Buffer.from(fileData.content, "base64").toString("utf-8"),
        })
      }
    } else if (item.type === "dir") {
      const subFiles = await getRepoFileContents(token, owner, repo, item.path)
      files = files.concat(subFiles)
    }
  }

  return files
}

const MAX_DIFF_CHARS = 120_000
const SUPERCODE_REVIEW_MARKER = "<!-- supercode-ai-review -->"

/** List open (non-draft) pull requests for auto-review backfill. */
export async function listOpenPullRequests(
  token: string,
  owner: string,
  repo: string,
  options?: { limit?: number },
): Promise<
  Array<{
    number: number
    title: string
    htmlUrl: string
    draft: boolean
    author: string
  }>
> {
  const octokit = new Octokit({ auth: token })
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50)

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: limit,
  })

  return data
    .filter((pr) => !pr.draft)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      draft: Boolean(pr.draft),
      author: pr.user?.login ?? "unknown",
    }))
}

export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = new Octokit({ auth: token })

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff",
    },
  })

  let diffText = diff as unknown as string
  if (diffText.length > MAX_DIFF_CHARS) {
    diffText =
      diffText.slice(0, MAX_DIFF_CHARS) +
      `\n\n...[diff truncated at ${MAX_DIFF_CHARS} chars]...`
  }

  return {
    diff: diffText,
    title: pr.title,
    description: pr.body || "",
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    author: pr.user?.login ?? "unknown",
    changedFiles: files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.slice(0, 4000),
    })),
    additions: pr.additions,
    deletions: pr.deletions,
    draft: pr.draft ?? false,
  }
}

function formatReviewBody(review: string): string {
  return [
    SUPERCODE_REVIEW_MARKER,
    "## 🤖 Supercode AI Review",
    "",
    review.trim(),
    "",
    "---",
    "*Automated review by [Supercode](https://supercli.com) · leave a 👍/👎 reaction to rate this review*",
  ].join("\n")
}

/**
 * Post (or update) the Supercode review on a PR:
 * 1. Upsert a sticky issue comment (CodeRabbit-style summary)
 * 2. Submit a PR review on the head commit so it shows in the Reviews tab
 */
export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: string,
  options?: { headSha?: string; event?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" },
) {
  const octokit = new Octokit({ auth: token })
  const body = formatReviewBody(review)

  // 1) Sticky summary comment — update existing bot comment on re-runs.
  // This is the primary user-visible delivery path for auto-reviews.
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  })

  const existing = comments.find((c) => c.body?.includes(SUPERCODE_REVIEW_MARKER))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    })
    console.log(
      `[github] updated sticky review comment on ${owner}/${repo}#${prNumber} comment_id=${existing.id}`,
    )
  } else {
    const { data: created } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })
    console.log(
      `[github] created sticky review comment on ${owner}/${repo}#${prNumber} comment_id=${created.id}`,
    )
  }

  // 2) Formal PR review attached to the head SHA (shows under "Reviews")
  try {
    let commitId = options?.headSha
    if (!commitId) {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      })
      commitId = pr.head.sha
    }

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      commit_id: commitId,
      event: options?.event ?? "COMMENT",
      body: [
        SUPERCODE_REVIEW_MARKER,
        "### Supercode review summary",
        "",
        // Keep the formal review body shorter — full write-up is in the sticky comment
        review.trim().slice(0, 60_000),
      ].join("\n"),
    })
  } catch (error) {
    // Sticky comment already posted; formal review can fail on permissions / already-reviewed
    console.error("[github] createReview failed (sticky comment still posted):", error)
  }
}
