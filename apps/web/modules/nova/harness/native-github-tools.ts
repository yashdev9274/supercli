import { Octokit } from "octokit"

import prisma from "@super/db"
import { getGithubTokenForUser } from "@/modules/github/lib/github"
import type { HarnessChatTool } from "@/modules/nova/harness/client"

export const NATIVE_GITHUB_TOOL_NAMES = [
  "nova_github_list_pull_requests",
  "nova_github_get_pull_request",
  "nova_github_get_viewer",
] as const

export function nativeGithubHarnessTools(): HarnessChatTool[] {
  return [
    {
      type: "function",
      function: {
        name: "nova_github_list_pull_requests",
        description:
          "List pull requests for a GitHub repository the signed-in user can access. Use this to find the latest PR (sort created desc). Defaults to open PRs; pass state=all for everything.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Org or user, e.g. supercodeai" },
            repo: { type: "string", description: "Repository name, e.g. supercli" },
            state: { type: "string", enum: ["open", "closed", "all"], description: "PR state filter" },
            per_page: { type: "number", description: "1–30, default 10" },
            sort: { type: "string", enum: ["created", "updated", "popularity", "long-running"] },
            direction: { type: "string", enum: ["asc", "desc"] },
          },
          required: ["owner", "repo"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "nova_github_get_pull_request",
        description: "Get one pull request’s title, body, state, author, branch, URL, and changed files summary.",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            pull_number: { type: "number" },
          },
          required: ["owner", "repo", "pull_number"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "nova_github_get_viewer",
        description: "Return the authenticated GitHub login for the signed-in Supercode user.",
        parameters: { type: "object", properties: {} },
      },
    },
  ]
}

async function octokitForUser(userId: string) {
  try {
    return new Octokit({ auth: await getGithubTokenForUser(userId), request: { timeout: 20_000 } })
  } catch {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user?.email) throw new Error("GitHub is not connected for this account")
    const { default: terminalPrisma } = await import("@super/db-terminal")
    const account = await terminalPrisma.account.findFirst({
      where: { providerId: "github", user: { email: { equals: user.email, mode: "insensitive" } } },
      select: { accessToken: true, accessTokenExpiresAt: true },
    })
    if (!account?.accessToken || (account.accessTokenExpiresAt && account.accessTokenExpiresAt <= new Date())) {
      throw new Error("GitHub is not connected for this account")
    }
    return new Octokit({ auth: account.accessToken, request: { timeout: 20_000 } })
  }
}

export async function executeNativeGithubTool(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const github = await octokitForUser(userId)

  if (toolName === "nova_github_get_viewer") {
    const { data } = await github.rest.users.getAuthenticated()
    return { successful: true, data: { login: data.login, name: data.name, html_url: data.html_url } }
  }

  if (toolName === "nova_github_list_pull_requests") {
    const owner = String(args.owner || "")
    const repo = String(args.repo || "")
    if (!owner || !repo) return { successful: false, error: "owner and repo are required" }
    const { data } = await github.rest.pulls.list({
      owner,
      repo,
      state: (args.state as "open" | "closed" | "all") || "open",
      per_page: Math.min(30, Math.max(1, Number(args.per_page) || 10)),
      sort: (args.sort as "created" | "updated") || "created",
      direction: (args.direction as "asc" | "desc") || "desc",
    })
    return {
      successful: true,
      data: {
        repository: `${owner}/${repo}`,
        pull_requests: data.map((pr) => ({
          number: pr.number,
          title: pr.title,
          state: pr.state,
          draft: pr.draft,
          user: pr.user?.login,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          html_url: pr.html_url,
          head: pr.head.ref,
          base: pr.base.ref,
        })),
      },
    }
  }

  if (toolName === "nova_github_get_pull_request") {
    const owner = String(args.owner || "")
    const repo = String(args.repo || "")
    const pull_number = Number(args.pull_number)
    if (!owner || !repo || !pull_number) {
      return { successful: false, error: "owner, repo, and pull_number are required" }
    }
    const [pr, files] = await Promise.all([
      github.rest.pulls.get({ owner, repo, pull_number }),
      github.rest.pulls.listFiles({ owner, repo, pull_number, per_page: 100 }),
    ])
    const data = pr.data
    return {
      successful: true,
      data: {
        number: data.number,
        title: data.title,
        state: data.state,
        draft: data.draft,
        body: (data.body || "").slice(0, 12_000),
        user: data.user?.login,
        html_url: data.html_url,
        created_at: data.created_at,
        merged_at: data.merged_at,
        head: data.head.ref,
        base: data.base.ref,
        additions: data.additions,
        deletions: data.deletions,
        changed_files: data.changed_files,
        files: files.data.slice(0, 80).map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        })),
      },
    }
  }

  return { successful: false, error: `Unknown native GitHub tool: ${toolName}` }
}

export function isNativeGithubTool(name: string): boolean {
  return (NATIVE_GITHUB_TOOL_NAMES as readonly string[]).includes(name)
}
