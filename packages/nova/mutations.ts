import { createHash } from "node:crypto"

import {
  githubCommentArgumentsSchema,
  linearReplyArgumentsSchema,
  slackReplyArgumentsSchema,
  type ConversationalMutationTool,
  type GitHubCommentArguments,
  type LinearReplyArguments,
  type MutationArguments,
  type MutationPreview,
  type SlackReplyArguments,
} from "./contracts"

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue }

function canonicalize(value: unknown): CanonicalJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Mutation arguments must contain finite numbers")
    return value
  }
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, canonicalize(record[key])]),
    )
  }
  throw new Error(`Mutation arguments contain an unsupported ${typeof value} value`)
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function normalizedArgsHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

export function parseMutationArguments(tool: "slack.reply", value: unknown): SlackReplyArguments
export function parseMutationArguments(tool: "linear.reply", value: unknown): LinearReplyArguments
export function parseMutationArguments(tool: "github.comment", value: unknown): GitHubCommentArguments
export function parseMutationArguments(tool: ConversationalMutationTool, value: unknown): MutationArguments
export function parseMutationArguments(
  tool: ConversationalMutationTool,
  value: unknown,
): MutationArguments {
  if (tool === "slack.reply") return slackReplyArgumentsSchema.parse(value)
  if (tool === "linear.reply") return linearReplyArgumentsSchema.parse(value)
  return githubCommentArgumentsSchema.parse(value)
}

export function mutationPreview(
  tool: ConversationalMutationTool,
  value: unknown,
): MutationPreview {
  const args = parseMutationArguments(tool, value)
  if (tool === "slack.reply") {
    const slack = slackReplyArgumentsSchema.parse(args)
    return {
      tool,
      text: slack.text,
      target: { channelId: slack.channelId, threadTimestamp: slack.threadTimestamp },
    }
  }
  if (tool === "linear.reply") {
    const linear = linearReplyArgumentsSchema.parse(args)
    return {
      tool,
      text: linear.text,
      target: { agentSessionId: linear.agentSessionId },
    }
  }
  const github = githubCommentArgumentsSchema.parse(args)
  return {
    tool,
    text: github.text,
    target: { repository: github.repository, issueNumber: github.issueNumber },
  }
}
