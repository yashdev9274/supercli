import { executeComposioTool } from "./composio"

/**
 * Post a Slack message via Composio tool.
 * Requires an active Slack connected account for the entity.
 */
export async function postSlackMessageViaComposio(params: {
  entityId: string
  connectedAccountId: string
  channel: string
  text: string
  threadTs?: string
}) {
  // Tool slug may vary by Composio toolkit version; common slug:
  return executeComposioTool({
    toolSlug: "SLACK_SENDS_A_MESSAGE_TO_A_SLACK_CHANNEL",
    userId: params.entityId,
    connectedAccountId: params.connectedAccountId,
    arguments: {
      channel: params.channel,
      text: params.text,
      ...(params.threadTs ? { thread_ts: params.threadTs } : {}),
    },
  })
}
