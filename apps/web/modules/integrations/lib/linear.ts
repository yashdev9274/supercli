import prisma from "@super/db"
import {
  composioEntityIdForOrg,
  executeComposioTool,
  isComposioConfigured,
} from "./composio"
import { getOrganizationIdForUser } from "./org"

/** Canonical Linear project for all Supercode Review issues (create once, reuse forever). */
export const SUPERCODE_AI_PROJECT_NAME = "supercodeAI"

const MAX_LINEAR_DESCRIPTION_CHARS = 60_000

function normalizeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "")
}

/** Match supercodeAI / Supercode AI / supercode-ai / etc. */
function isSupercodeAiProjectName(name: string | null | undefined): boolean {
  if (!name) return false
  return normalizeProjectName(name) === normalizeProjectName(SUPERCODE_AI_PROJECT_NAME)
}

type LinearConfig = {
  supercodeAiProjectId?: string
  supercodeAiTeamId?: string
}

type ToolResult = {
  successful?: boolean
  data?: unknown
  error?: unknown
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function unwrapData(result: unknown): unknown {
  const root = asRecord(result)
  if (!root) return result
  if ("data" in root) return root.data
  return result
}

function collectObjects(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out)
    return out
  }
  const obj = asRecord(value)
  if (!obj) return out
  out.push(obj)
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === "object") collectObjects(nested, out)
  }
  return out
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function extractId(result: unknown, preferKeys: string[] = ["id"]): string | null {
  for (const obj of collectObjects(unwrapData(result))) {
    const id = pickString(obj, preferKeys)
    if (id) return id
  }
  return null
}

function extractTeams(result: unknown): Array<{ id: string; name: string | null }> {
  const teams: Array<{ id: string; name: string | null }> = []
  const seen = new Set<string>()
  for (const obj of collectObjects(unwrapData(result))) {
    const id = pickString(obj, ["id", "teamId", "team_id"])
    if (!id || seen.has(id)) continue
    const name = pickString(obj, ["name", "displayName", "display_name"])
    const key = pickString(obj, ["key"])
    if (!name && !key) continue
    if (pickString(obj, ["identifier"]) && !key) continue
    seen.add(id)
    teams.push({ id, name })
  }
  return teams
}

function extractProjects(result: unknown): Array<{ id: string; name: string | null }> {
  const projects: Array<{ id: string; name: string | null }> = []
  const seen = new Set<string>()
  for (const obj of collectObjects(unwrapData(result))) {
    const id = pickString(obj, ["id", "projectId", "project_id"])
    const name = pickString(obj, ["name"])
    if (!id || !name || seen.has(id)) continue
    if (pickString(obj, ["identifier", "number"])) continue
    seen.add(id)
    projects.push({ id, name })
  }
  return projects
}

function extractIssues(result: unknown): Array<{
  id: string
  title: string | null
  identifier: string | null
  url: string | null
  description: string | null
}> {
  const issues: Array<{
    id: string
    title: string | null
    identifier: string | null
    url: string | null
    description: string | null
  }> = []
  const seen = new Set<string>()
  for (const obj of collectObjects(unwrapData(result))) {
    const id = pickString(obj, ["id", "issueId", "issue_id"])
    if (!id || seen.has(id)) continue
    const title = pickString(obj, ["title"])
    const identifier = pickString(obj, ["identifier"])
    const url = pickString(obj, ["url", "issueUrl", "issue_url"])
    const description = pickString(obj, ["description", "body"])
    if (!title && !identifier) continue
    seen.add(id)
    issues.push({ id, title, identifier, url, description })
  }
  return issues
}

function assertToolOk(result: unknown, label: string) {
  const root = asRecord(result)
  if (root && root.successful === false) {
    const err =
      typeof root.error === "string"
        ? root.error
        : root.error
          ? JSON.stringify(root.error)
          : "unknown error"
    throw new Error(`${label} failed: ${err}`)
  }
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n\n…truncated (${text.length} → ${max} chars)`
}

function readLinearConfig(config: unknown): LinearConfig {
  const obj = asRecord(config)
  if (!obj) return {}
  return {
    supercodeAiProjectId:
      typeof obj.supercodeAiProjectId === "string"
        ? obj.supercodeAiProjectId
        : undefined,
    supercodeAiTeamId:
      typeof obj.supercodeAiTeamId === "string" ? obj.supercodeAiTeamId : undefined,
  }
}

async function runLinearTool(params: {
  entityId: string
  connectedAccountId: string
  toolSlug: string
  arguments: Record<string, unknown>
}): Promise<ToolResult> {
  const result = (await executeComposioTool({
    toolSlug: params.toolSlug,
    userId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    arguments: params.arguments,
  })) as ToolResult
  assertToolOk(result, params.toolSlug)
  return result
}

export async function createLinearCommentViaComposio(params: {
  entityId: string
  connectedAccountId: string
  issueId: string
  body: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_CREATE_LINEAR_COMMENT",
    arguments: {
      issueId: params.issueId,
      body: params.body,
    },
  })
}

export async function createLinearIssueViaComposio(params: {
  entityId: string
  connectedAccountId: string
  title: string
  description?: string
  teamId: string
  projectId?: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_CREATE_LINEAR_ISSUE",
    arguments: {
      title: params.title,
      team_id: params.teamId,
      ...(params.description ? { description: params.description } : {}),
      ...(params.projectId ? { project_id: params.projectId } : {}),
    },
  })
}

export async function listLinearTeamsViaComposio(params: {
  entityId: string
  connectedAccountId: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_GET_ALL_LINEAR_TEAMS",
    arguments: {},
  })
}

export async function listLinearProjectsViaComposio(params: {
  entityId: string
  connectedAccountId: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_LIST_LINEAR_PROJECTS",
    arguments: {},
  })
}

export async function createLinearProjectViaComposio(params: {
  entityId: string
  connectedAccountId: string
  name: string
  teamIds: string[]
  description?: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_CREATE_LINEAR_PROJECT",
    arguments: {
      name: params.name,
      team_ids: params.teamIds,
      ...(params.description ? { description: params.description } : {}),
    },
  })
}

export async function listLinearIssuesViaComposio(params: {
  entityId: string
  connectedAccountId: string
  projectId?: string
  teamId?: string
}) {
  if (params.projectId) {
    try {
      return await runLinearTool({
        entityId: params.entityId,
        connectedAccountId: params.connectedAccountId,
        toolSlug: "LINEAR_LIST_LINEAR_ISSUES",
        arguments: { project_id: params.projectId },
      })
    } catch (error) {
      console.warn(
        "[linear] LINEAR_LIST_LINEAR_ISSUES by project failed, trying team list:",
        error,
      )
    }
  }

  if (params.teamId) {
    return runLinearTool({
      entityId: params.entityId,
      connectedAccountId: params.connectedAccountId,
      toolSlug: "LINEAR_LIST_ISSUES_BY_TEAM_ID",
      arguments: { team_id: params.teamId },
    })
  }

  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_LIST_LINEAR_ISSUES",
    arguments: {},
  })
}

export async function updateLinearIssueViaComposio(params: {
  entityId: string
  connectedAccountId: string
  issueId: string
  title?: string
  description?: string
  projectId?: string
}) {
  return runLinearTool({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    toolSlug: "LINEAR_UPDATE_ISSUE",
    arguments: {
      issue_id: params.issueId,
      ...(params.title ? { title: params.title } : {}),
      ...(params.description ? { description: params.description } : {}),
      ...(params.projectId ? { project_id: params.projectId } : {}),
    },
  })
}

function buildIssueTitle(params: {
  owner: string
  repo: string
  prNumber: number
  prTitle: string
}) {
  const title = params.prTitle?.trim() || `PR #${params.prNumber}`
  return `${params.owner}/${params.repo}#${params.prNumber}: ${title}`.slice(0, 240)
}

function buildIssueDescription(params: {
  owner: string
  repo: string
  prNumber: number
  prTitle: string
  prUrl: string
  prDescription: string
  reviewMarkdown: string
}) {
  const prDescription =
    params.prDescription?.trim() || "_No pull request description provided._"
  const review = params.reviewMarkdown?.trim() || "_Review body empty._"

  const body = [
    `## ${params.prTitle || `PR #${params.prNumber}`}`,
    ``,
    `**Pull request:** [${params.owner}/${params.repo}#${params.prNumber}](${params.prUrl})`,
    ``,
    `### PR description`,
    prDescription,
    ``,
    `---`,
    ``,
    `### Supercode review`,
    review,
  ].join("\n")

  return truncate(body, MAX_LINEAR_DESCRIPTION_CHARS)
}

async function resolveTeamId(params: {
  entityId: string
  connectedAccountId: string
  preferredTeamId?: string | null
  preferredTeamName?: string | null
}): Promise<{ teamId: string; teamName: string | null }> {
  if (params.preferredTeamId) {
    return {
      teamId: params.preferredTeamId,
      teamName: params.preferredTeamName ?? null,
    }
  }

  const listed = await listLinearTeamsViaComposio({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
  })
  const teams = extractTeams(listed)
  if (teams.length === 0) {
    throw new Error("No Linear teams found for connected account")
  }

  if (params.preferredTeamName) {
    const match = teams.find(
      (t) =>
        t.name?.toLowerCase() === params.preferredTeamName!.toLowerCase(),
    )
    if (match) return { teamId: match.id, teamName: match.name }
  }

  return { teamId: teams[0].id, teamName: teams[0].name }
}

async function listAllLinearProjects(params: {
  entityId: string
  connectedAccountId: string
}): Promise<Array<{ id: string; name: string | null }>> {
  const listed = await listLinearProjectsViaComposio({
    entityId: params.entityId,
    connectedAccountId: params.connectedAccountId,
  })
  return extractProjects(listed)
}

/**
 * Resolve the single shared Linear project for reviews.
 * Order: cached id → existing name match (supercodeAI variants) → create once.
 * Never creates when a match or cache already exists.
 */
async function ensureSupercodeAiProject(params: {
  entityId: string
  connectedAccountId: string
  teamId: string
  cachedProjectId?: string | null
}): Promise<string> {
  // Fast path: once we've stored the project id, always reuse it.
  // Avoids list/create races that would spawn duplicate projects per review.
  if (params.cachedProjectId?.trim()) {
    return params.cachedProjectId.trim()
  }

  let projects: Array<{ id: string; name: string | null }> = []
  try {
    projects = await listAllLinearProjects({
      entityId: params.entityId,
      connectedAccountId: params.connectedAccountId,
    })
    const existing = projects.find((p) => isSupercodeAiProjectName(p.name))
    if (existing?.id) {
      console.log(
        `[linear] reusing existing project "${existing.name}" id=${existing.id}`,
      )
      return existing.id
    }
  } catch (error) {
    console.warn("[linear] list projects failed before create:", error)
  }

  console.log(
    `[linear] creating project "${SUPERCODE_AI_PROJECT_NAME}" on team=${params.teamId}`,
  )
  try {
    const created = await createLinearProjectViaComposio({
      entityId: params.entityId,
      connectedAccountId: params.connectedAccountId,
      name: SUPERCODE_AI_PROJECT_NAME,
      teamIds: [params.teamId],
      description:
        "Automated PR reviews from Supercode Review. One shared project for all connected-repo reviews — issues are created/updated per PR, not new projects.",
    })

    const projectId = extractId(created, ["id", "projectId", "project_id"])
    if (projectId) return projectId
  } catch (createError) {
    // Another worker may have created it concurrently — re-list and reuse.
    console.warn(
      "[linear] create project failed; re-listing for existing supercodeAI:",
      createError,
    )
  }

  try {
    projects = await listAllLinearProjects({
      entityId: params.entityId,
      connectedAccountId: params.connectedAccountId,
    })
    const existing = projects.find((p) => isSupercodeAiProjectName(p.name))
    if (existing?.id) return existing.id
  } catch (error) {
    console.warn("[linear] re-list projects after create failed:", error)
  }

  throw new Error(
    `Could not find or create Linear project "${SUPERCODE_AI_PROJECT_NAME}"`,
  )
}

async function findExistingReviewIssue(params: {
  entityId: string
  connectedAccountId: string
  projectId: string
  teamId: string
  prUrl: string
  owner: string
  repo: string
  prNumber: number
}): Promise<{ id: string; identifier: string | null; url: string | null } | null> {
  const needleUrl = params.prUrl.toLowerCase()
  const needleRef = `${params.owner}/${params.repo}#${params.prNumber}`.toLowerCase()
  const needleTitlePrefix = `${params.owner}/${params.repo}#${params.prNumber}:`.toLowerCase()

  try {
    const listed = await listLinearIssuesViaComposio({
      entityId: params.entityId,
      connectedAccountId: params.connectedAccountId,
      projectId: params.projectId,
      teamId: params.teamId,
    })
    const issues = extractIssues(listed)
    const match = issues.find((issue) => {
      const title = (issue.title || "").toLowerCase()
      const description = (issue.description || "").toLowerCase()
      return (
        title.startsWith(needleTitlePrefix) ||
        description.includes(needleUrl) ||
        description.includes(needleRef)
      )
    })
    if (match) {
      return { id: match.id, identifier: match.identifier, url: match.url }
    }
  } catch (error) {
    console.warn("[linear] findExistingReviewIssue failed:", error)
  }
  return null
}

export type NotifyLinearReviewInput = {
  userId: string
  owner: string
  repo: string
  prNumber: number
  prTitle: string
  prUrl: string
  prDescription: string
  reviewMarkdown: string
  reviewId?: string | null
}

export type NotifyLinearReviewResult = {
  skipped?: boolean
  reason?: string
  issueId?: string
  issueIdentifier?: string | null
  issueUrl?: string | null
  projectId?: string
  teamId?: string
  updated?: boolean
}

/**
 * After a Supercode PR review completes, ensure Linear has a single "supercodeAI"
 * project and create/update an issue for this PR under that project (never a new project per review).
 */
export async function notifyLinearOfCompletedReview(
  input: NotifyLinearReviewInput,
): Promise<NotifyLinearReviewResult> {
  if (!isComposioConfigured()) {
    return { skipped: true, reason: "composio_not_configured" }
  }

  const organizationId = await getOrganizationIdForUser(input.userId)
  if (!organizationId) {
    return { skipped: true, reason: "no_organization" }
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "linear",
      },
    },
  })

  if (!integration?.isActive || !integration.composioConnectedAccountId) {
    return { skipped: true, reason: "linear_not_connected" }
  }

  const entityId =
    integration.composioEntityId || composioEntityIdForOrg(organizationId)
  const connectedAccountId = integration.composioConnectedAccountId
  const cached = readLinearConfig(integration.config)

  const { teamId, teamName } = await resolveTeamId({
    entityId,
    connectedAccountId,
    preferredTeamId: cached.supercodeAiTeamId || integration.linearTeamId,
    preferredTeamName: integration.linearTeamName,
  })

  const projectId = await ensureSupercodeAiProject({
    entityId,
    connectedAccountId,
    teamId,
    cachedProjectId: cached.supercodeAiProjectId,
  })

  const nextConfig: LinearConfig = {
    ...cached,
    supercodeAiProjectId: projectId,
    supercodeAiTeamId: teamId,
  }
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      config: nextConfig,
      ...(integration.linearTeamId
        ? {}
        : {
            linearTeamId: teamId,
            linearTeamName: teamName,
          }),
    },
  })

  const title = buildIssueTitle({
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    prTitle: input.prTitle,
  })
  const description = buildIssueDescription({
    owner: input.owner,
    repo: input.repo,
    prNumber: input.prNumber,
    prTitle: input.prTitle,
    prUrl: input.prUrl,
    prDescription: input.prDescription,
    reviewMarkdown: input.reviewMarkdown,
  })

  // Prefer our Conversation mapping (stable across re-reviews)
  let existing: {
    id: string
    identifier: string | null
    url: string | null
  } | null = null

  if (input.reviewId) {
    try {
      const mapped = await prisma.conversation.findFirst({
        where: {
          organizationId,
          provider: "linear",
          reviewId: input.reviewId,
        },
        orderBy: { updatedAt: "desc" },
        select: { externalId: true },
      })
      if (mapped?.externalId) {
        existing = {
          id: mapped.externalId,
          identifier: null,
          url: null,
        }
      }
    } catch (error) {
      console.warn("[linear] conversation lookup by reviewId failed:", error)
    }
  }

  if (!existing) {
    existing = await findExistingReviewIssue({
      entityId,
      connectedAccountId,
      projectId,
      teamId,
      prUrl: input.prUrl,
      owner: input.owner,
      repo: input.repo,
      prNumber: input.prNumber,
    })
  }

  let issueId: string
  let issueIdentifier: string | null = null
  let issueUrl: string | null = null
  let updated = false

  if (existing) {
    await updateLinearIssueViaComposio({
      entityId,
      connectedAccountId,
      issueId: existing.id,
      title,
      description,
      projectId,
    })
    issueId = existing.id
    issueIdentifier = existing.identifier
    issueUrl = existing.url
    updated = true
  } else {
    const created = await createLinearIssueViaComposio({
      entityId,
      connectedAccountId,
      title,
      description,
      teamId,
      projectId,
    })
    const createdIssue = extractIssues(created)[0]
    issueId =
      createdIssue?.id ||
      extractId(created, ["id", "issueId", "issue_id"]) ||
      ""
    if (!issueId) {
      throw new Error("LINEAR_CREATE_LINEAR_ISSUE returned no issue id")
    }
    issueIdentifier = createdIssue?.identifier ?? null
    issueUrl = createdIssue?.url ?? null
  }

  try {
    await prisma.conversation.upsert({
      where: {
        organizationId_provider_externalId: {
          organizationId,
          provider: "linear",
          externalId: issueId,
        },
      },
      create: {
        organizationId,
        provider: "linear",
        externalId: issueId,
        reviewId: input.reviewId ?? null,
        channelId: projectId,
        messages: {
          create: {
            role: "system",
            content: updated
              ? `Updated Linear issue for ${input.owner}/${input.repo}#${input.prNumber}`
              : `Created Linear issue for ${input.owner}/${input.repo}#${input.prNumber}`,
            metadata: {
              issueIdentifier,
              issueUrl,
              projectId,
              teamId,
              prUrl: input.prUrl,
            },
          },
        },
      },
      update: {
        reviewId: input.reviewId ?? undefined,
        channelId: projectId,
        messages: {
          create: {
            role: "system",
            content: `Synced Supercode review to Linear for ${input.owner}/${input.repo}#${input.prNumber}`,
            metadata: {
              issueIdentifier,
              issueUrl,
              projectId,
              teamId,
              prUrl: input.prUrl,
              updated,
            },
          },
        },
      },
    })
  } catch (error) {
    console.warn("[linear] conversation upsert failed (non-fatal):", error)
  }

  return {
    issueId,
    issueIdentifier,
    issueUrl,
    projectId,
    teamId,
    updated,
  }
}
