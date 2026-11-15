import { subagentEventSchema, type SubagentEvent } from "./subagent-events"

type ActivityData = {
  agentSessionId: string
  surfaceId: string
  runId: string
  sequence: number
  type: string
  status: string
  title: string
  body: string
}

export type SubagentActivityTransaction = {
  agentSession: {
    update(input: { where: { id: string }; data: { nextSequence: { increment: number } }; select: { nextSequence: true } }): Promise<{ nextSequence: number }>
  }
  agentActivity: {
    create(input: { data: ActivityData }): Promise<{
      id: string; runId: string | null; sequence: number; type: string; status: string
      title: string | null; body: string | null; createdAt: Date
    }>
  }
}

export async function persistSubagentActivity(
  transaction: <T>(run: (tx: SubagentActivityTransaction) => Promise<T>) => Promise<T>,
  scope: { sessionId: string; surfaceId: string; runId: string },
  event: SubagentEvent,
) {
  const child = subagentEventSchema.parse(event)
  const activity = await transaction(async (tx) => {
    const sequence = await tx.agentSession.update({
      where: { id: scope.sessionId },
      data: { nextSequence: { increment: 1 } },
      select: { nextSequence: true },
    })
    return tx.agentActivity.create({
      data: {
        agentSessionId: scope.sessionId, surfaceId: scope.surfaceId, runId: scope.runId,
        sequence: sequence.nextSequence - 1, type: "subagent", status: child.status,
        title: child.title, body: JSON.stringify(child),
      },
    })
  })
  return {
    id: activity.id, sessionId: scope.sessionId, runId: activity.runId,
    sequence: activity.sequence, type: activity.type, status: activity.status,
    title: activity.title, body: activity.body, createdAt: activity.createdAt.toISOString(),
  }
}
