import { executeComposioTool } from "./composio"

export async function createLinearCommentViaComposio(params: {
  entityId: string
  connectedAccountId: string
  issueId: string
  body: string
}) {
  return executeComposioTool({
    toolSlug: "LINEAR_CREATE_LINEAR_COMMENT",
    userId: params.entityId,
    connectedAccountId: params.connectedAccountId,
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
}) {
  return executeComposioTool({
    toolSlug: "LINEAR_CREATE_LINEAR_ISSUE",
    userId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    arguments: {
      title: params.title,
      description: params.description,
      teamId: params.teamId,
    },
  })
}
