import { expect, mock, test } from "bun:test"

import type { NovaReference } from "../references/contracts"

const reference: NovaReference = { kind: "files", id: "repo_1:src/auth.ts", label: "src/auth.ts", description: "nova/example" }
let sequence = 1
let messageData: Record<string, unknown> | undefined
let activityData: Record<string, unknown> | undefined
let duplicate = false
const db = {
  organizationMembership: { findUnique: async () => ({ id: "membership_1", status: "active" }) },
  agentSession: {
    findFirst: async () => ({ id: "session_1", status: "active", nextSequence: sequence }),
    findUniqueOrThrow: async () => ({ nextSequence: sequence, activeRunId: "run_1" }),
    update: async ({ data }: { data: { nextSequence?: { increment: number } } }) => {
      sequence += data.nextSequence?.increment ?? 0
      return { nextSequence: sequence }
    },
  },
  sessionSurface: {
    findUnique: async () => ({ id: "surface_web", status: "active" }),
    update: async () => ({}),
  },
  agentSessionMessage: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      messageData = { ...data, id: "message_1", createdAt: new Date() }
      return messageData
    },
    findFirst: async () => duplicate ? { ...messageData, agentSession: { nextSequence: sequence, activeRunId: "run_1" } } : null,
    findMany: async () => messageData ? [messageData] : [],
  },
  agentRun: { create: async () => ({ id: "run_1" }) },
  agentActivity: {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      activityData = { ...data, id: "activity_1", createdAt: new Date() }
      return activityData
    },
    findMany: async () => activityData ? [activityData] : [],
  },
  $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
}
mock.module("@super/db", () => ({ default: db }))
mock.module("@/modules/integrations/lib/org", () => ({ ensureUserOrganization: async () => "org_1" }))
const { postSessionMessage, syncAgentSession } = await import("./service")

test("reference chips are persisted, hydrated on sync, and retained for duplicate message IDs", async () => {
  const posted = await postSessionMessage({ userId: "user_1", sessionId: "session_1", content: "Explain this file", clientMessageId: "client_1", surface: "web", references: [reference] })
  expect(messageData?.metadata).toMatchObject({ references: [reference] })
  expect(posted?.message.references).toEqual([reference])
  const sync = await syncAgentSession({ userId: "user_1", sessionId: "session_1", afterSequence: 0 })
  const message = sync?.messages[0] as (NonNullable<typeof sync>["messages"][number] & { references?: NovaReference[] }) | undefined
  expect(message?.references).toEqual([reference])
  duplicate = true
  const repeated = await postSessionMessage({ userId: "user_1", sessionId: "session_1", content: "Explain this file", clientMessageId: "client_1", surface: "web", references: [] })
  expect(repeated?.message.references).toEqual([reference])
})
