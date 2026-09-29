import prisma from "@super/db"

import {
  composioEntityIdForOrg,
  executeComposioTool,
  getComposio,
} from "@/modules/integrations/lib/composio"
import type { GitHubPullRequestContext } from "./github"

type NovaComposioProvider = "slack" | "linear" | "github"

type ToolResult = {
  successful?: boolean
  error?: unknown
  data?: unknown
}

const resolvedTools = new Map<string, Promise<string>>()

async function resolveToolSlug(input: {
  provider: NovaComposioProvider
  configured?: string
  preferred: string
  pattern: RegExp
}) {
  if (input.configured?.trim()) return input.configured.trim()
  const key = `${input.provider}:${input.preferred}`
  const cached = resolvedTools.get(key)
  if (cached) return cached
  const pending = getComposio().tools.getRawComposioTools({ toolkits: [input.provider] })
    .then((tools) => {
      const active = tools.filter((tool) => !tool.isDeprecated)
      const match = active.find((tool) => tool.slug === input.preferred)
        ?? active.find((tool) => input.pattern.test(tool.slug))
      if (!match) throw new Error(`Composio ${input.provider} toolkit does not expose the required Nova tool`)
      return match.slug
    })
    .catch((error) => {
      resolvedTools.delete(key)
      throw error
    })
  resolvedTools.set(key, pending)
  return pending
}

export async function resolveNovaComposioConnection(
  organizationId: string,
  provider: NovaComposioProvider,
  expectedConnectedAccountId?: string,
) {
  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  })
  if (!integration?.isActive || !integration.composioConnectedAccountId) {
    throw new Error(`Connect ${provider} through Composio before Nova uses it`)
  }
  if (
    expectedConnectedAccountId &&
    integration.composioConnectedAccountId !== expectedConnectedAccountId
  ) {
    throw new Error(`${provider} was reconnected after this action was approved`)
  }
  return {
    connectedAccountId: integration.composioConnectedAccountId,
    entityId: integration.composioEntityId || composioEntityIdForOrg(organizationId),
  }
}

function resultRecord(result: ToolResult): Record<string, unknown> {
  if (result.successful === false || result.error) {
    throw new Error(typeof result.error === "string" ? result.error : "Composio tool execution failed")
  }
  return result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as Record<string, unknown>
    : {}
}

function externalId(result: ToolResult): string {
  const data = resultRecord(result)
  const candidates = [data.id, data.ts, data.comment_id, data.commentId, data.activityId]
  const value = candidates.find((candidate) => typeof candidate === "string" || typeof candidate === "number")
  return value === undefined ? `composio_${Date.now()}` : String(value)
}

async function executeProviderTool(input: {
  organizationId: string
  provider: NovaComposioProvider
  connectedAccountId?: string
  toolSlug: string
  arguments: Record<string, unknown>
}): Promise<ToolResult> {
  const connection = await resolveNovaComposioConnection(
    input.organizationId,
    input.provider,
    input.connectedAccountId,
  )
  return executeComposioTool({
    toolSlug: input.toolSlug,
    userId: connection.entityId,
    connectedAccountId: connection.connectedAccountId,
    arguments: input.arguments,
  }) as Promise<ToolResult>
}

export async function postSlackReplyViaComposio(input: {
  organizationId: string
  connectedAccountId?: string
  channelId: string
  threadTimestamp: string
  text: string
}) {
  const toolSlug = await resolveToolSlug({
    provider: "slack",
    configured: process.env.NOVA_COMPOSIO_SLACK_REPLY_TOOL,
    preferred: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    pattern: /SEND.*MESSAGE.*CHANNEL/i,
  })
  return externalId(await executeProviderTool({
    organizationId: input.organizationId,
    provider: "slack",
    connectedAccountId: input.connectedAccountId,
    toolSlug,
    arguments: {
      channel: input.channelId,
      text: input.text,
      thread_ts: input.threadTimestamp,
    },
  }))
}

export async function postLinearReplyViaComposio(input: {
  organizationId: string
  connectedAccountId?: string
  issueId: string
  text: string
}) {
  const toolSlug = await resolveToolSlug({
    provider: "linear",
    configured: process.env.NOVA_COMPOSIO_LINEAR_REPLY_TOOL,
    preferred: "LINEAR_CREATE_LINEAR_COMMENT",
    pattern: /CREATE.*COMMENT/i,
  })
  return externalId(await executeProviderTool({
    organizationId: input.organizationId,
    provider: "linear",
    connectedAccountId: input.connectedAccountId,
    toolSlug,
    arguments: { issueId: input.issueId, body: input.text },
  }))
}

export async function postGitHubReplyViaComposio(input: {
  organizationId: string
  connectedAccountId?: string
  repository: string
  issueNumber: number
  text: string
}) {
  const [owner, repo] = input.repository.split("/")
  if (!owner || !repo) throw new Error("GitHub surface has an invalid repository")
  const toolSlug = await resolveToolSlug({
    provider: "github",
    configured: process.env.NOVA_COMPOSIO_GITHUB_COMMENT_TOOL,
    preferred: "GITHUB_CREATE_AN_ISSUE_COMMENT",
    pattern: /CREATE.*ISSUE.*COMMENT/i,
  })
  return externalId(await executeProviderTool({
    organizationId: input.organizationId,
    provider: "github",
    connectedAccountId: input.connectedAccountId,
    toolSlug,
    arguments: {
      owner,
      repo,
      issue_number: input.issueNumber,
      body: input.text,
    },
  }))
}

export async function readGitHubPullRequestViaComposio(input: {
  organizationId: string
  repository: string
  pullNumber: number
}): Promise<GitHubPullRequestContext> {
  const [owner, repo] = input.repository.split("/")
  if (!owner || !repo) throw new Error("GitHub pull request target is invalid")
  const connection = await resolveNovaComposioConnection(input.organizationId, "github")
  const run = async (toolSlug: string, args: Record<string, unknown>) => {
    const result = await executeComposioTool({
      toolSlug,
      userId: connection.entityId,
      connectedAccountId: connection.connectedAccountId,
      arguments: args,
    }) as ToolResult
    return resultRecord(result)
  }
  const base = { owner, repo, pull_number: input.pullNumber }
  const [pullTool, filesTool, checksTool] = await Promise.all([
    resolveToolSlug({
      provider: "github",
      configured: process.env.NOVA_COMPOSIO_GITHUB_GET_PULL_TOOL,
      preferred: "GITHUB_GET_A_PULL_REQUEST",
      pattern: /^GITHUB_GET.*PULL.*REQUEST$/i,
    }),
    resolveToolSlug({
      provider: "github",
      configured: process.env.NOVA_COMPOSIO_GITHUB_LIST_FILES_TOOL,
      preferred: "GITHUB_LIST_PULL_REQUEST_FILES",
      pattern: /LIST.*PULL.*REQUEST.*FILES/i,
    }),
    resolveToolSlug({
      provider: "github",
      configured: process.env.NOVA_COMPOSIO_GITHUB_LIST_CHECKS_TOOL,
      preferred: "GITHUB_LIST_CHECK_RUNS_FOR_A_GIT_REFERENCE",
      pattern: /LIST.*CHECK.*RUNS/i,
    }).catch(() => null),
  ])
  const [pull, files, checksValue] = await Promise.all([
    run(pullTool, base),
    run(filesTool, base),
    checksTool
      ? run(checksTool, { owner, repo, ref: "HEAD" }).catch(() => ({}))
      : Promise.resolve({}),
  ])
  const checks = checksValue as Record<string, unknown>
  const head = pull.head && typeof pull.head === "object" && !Array.isArray(pull.head)
    ? pull.head as Record<string, unknown>
    : {}
  const baseBranch = pull.base && typeof pull.base === "object" && !Array.isArray(pull.base)
    ? pull.base as Record<string, unknown>
    : {}
  const user = pull.user && typeof pull.user === "object" && !Array.isArray(pull.user)
    ? pull.user as Record<string, unknown>
    : {}
  const fileRows = Array.isArray(files) ? files : Array.isArray(files.items) ? files.items : Array.isArray(files.files) ? files.files : []
  const checkRows: unknown[] = Array.isArray(checks.check_runs)
    ? checks.check_runs
    : Array.isArray(checks.items) ? checks.items : []
  const headSha = typeof head.sha === "string"
    ? head.sha
    : typeof pull.head_sha === "string" ? pull.head_sha : "unknown"
  return {
    repository: input.repository,
    number: input.pullNumber,
    title: typeof pull.title === "string" ? pull.title : `Pull request #${input.pullNumber}`,
    body: typeof pull.body === "string" ? pull.body.slice(0, 8_000) : "",
    url: typeof pull.html_url === "string" ? pull.html_url : null,
    state: typeof pull.state === "string" ? pull.state : "unknown",
    draft: pull.draft === true,
    author: typeof user.login === "string" ? user.login : null,
    baseBranch: typeof baseBranch.ref === "string" ? baseBranch.ref : null,
    headBranch: typeof head.ref === "string" ? head.ref : null,
    headSha,
    changedFiles: fileRows.slice(0, 50).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const file = value as Record<string, unknown>
      return [{
        path: typeof file.filename === "string" ? file.filename : "unknown",
        status: typeof file.status === "string" ? file.status : "unknown",
        additions: typeof file.additions === "number" ? file.additions : 0,
        deletions: typeof file.deletions === "number" ? file.deletions : 0,
        patch: typeof file.patch === "string" ? file.patch.slice(0, 4_000) : null,
      }]
    }),
    checks: checkRows.slice(0, 50).flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return []
      const check = value as Record<string, unknown>
      return [{
        name: typeof check.name === "string" ? check.name : "unknown",
        status: typeof check.status === "string" ? check.status : "unknown",
        conclusion: typeof check.conclusion === "string" ? check.conclusion : null,
        url: typeof check.html_url === "string" ? check.html_url : null,
      }]
    }),
  }
}
