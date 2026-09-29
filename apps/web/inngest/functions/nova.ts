import {
  approvalContinuationIsTerminal,
} from "@super/nova"

import {
  expirePendingApprovals,
} from "@/modules/nova/approvals/service"
import {
  createResponseActivity,
  deliverActivity,
  reconcileActivityDeliveryOutbox,
} from "@/modules/nova/delivery/service"
import {
  appendInboundMessage,
  markInboundEventFailed,
} from "@/modules/nova/events/service"
import {
  completeApprovalContinuation,
  executeApprovedMutation,
  failApprovalContinuation,
  persistMutationProposal,
  reconcileApprovalContinuations,
} from "@/modules/nova/mutations/service"
import {
  claimRunOutbox,
  completeMutationRun,
  completeRunOutbox,
  gatherRunPrompt,
  generateNovaResponse,
  markRunOutboxFailed,
  pauseRunOutbox,
  persistRunResponse,
  reconcileRunOutbox,
  transitionRun,
} from "@/modules/nova/runs/service"
import { inngest } from "../client"

export const processNovaInboundEvent = inngest.createFunction(
  {
    id: "nova-process-inbound-event",
    concurrency: [
      { limit: 1, key: "event.data.inboundEventId" },
      { limit: 20 },
    ],
    retries: 4,
    onFailure: async ({ event, error }) => {
      const inboundEventId = event.data.event.data.inboundEventId as string | undefined
      if (!inboundEventId) return
      await markInboundEventFailed(inboundEventId, error)
    },
  },
  { event: "nova/inbound.received" },
  async ({ event, step }) => {
    const inboundEventId = event.data.inboundEventId as string | undefined
    if (!inboundEventId) return { ignored: true, reason: "missing_inbound_event_id" }

    return step.run("persist-canonical-message", async () => {
      return appendInboundMessage(inboundEventId)
    })
  },
)

export const processNovaRun = inngest.createFunction(
  {
    id: "nova-process-run",
    concurrency: [
      { limit: 1, key: "event.data.outboxEventId" },
      { limit: 10 },
    ],
    retries: 4,
    onFailure: async ({ event, error }) => {
      const outboxEventId = event.data.event.data.outboxEventId as string | undefined
      if (!outboxEventId) return
      await markRunOutboxFailed(outboxEventId, error)
    },
  },
  { event: "nova/run.requested" },
  async ({ event, step }) => {
    const outboxEventId = event.data.outboxEventId as string | undefined
    if (!outboxEventId) return { ignored: true, reason: "missing_outbox_event_id" }

    const claimed = await step.run("claim-run", () => claimRunOutbox(outboxEventId))
    if (claimed.completed || claimed.awaitingApproval || claimed.inProgress) {
      return {
        runId: claimed.runId,
        replayed: true,
        awaitingApproval: claimed.awaitingApproval,
        inProgress: claimed.inProgress,
      }
    }
    await step.run("acknowledge-run", () => transitionRun(claimed.runId, "acknowledging"))
    await step.run("begin-context-gathering", () =>
      transitionRun(claimed.runId, "gathering_context"),
    )
    const prompt = await step.run("gather-canonical-context", () =>
      gatherRunPrompt(claimed.agentSessionId, claimed.messageId, claimed.surfaceId),
    )
    await step.run("begin-planning", () => transitionRun(claimed.runId, "planning"))
    const response = await step.run("generate-response-or-proposal", () =>
      generateNovaResponse(prompt),
    )
    if (response.output.kind === "mutation_proposal") {
      const proposal = response.output
      const proposed = await step.run("persist-mutation-proposal", () =>
        persistMutationProposal({
          runId: claimed.runId,
          agentSessionId: claimed.agentSessionId,
          surfaceId: claimed.surfaceId,
          proposal,
          model: response.model,
        }),
      )
      await step.run("pause-run-outbox", () => pauseRunOutbox(outboxEventId))
      return {
        runId: claimed.runId,
        approvalId: proposed.approvalId,
        activityId: proposed.activityId,
        awaitingApproval: true,
      }
    }
    await step.run("begin-delivery", () => transitionRun(claimed.runId, "delivering"))
    const activity = await step.run("persist-and-enqueue-response", () =>
      persistRunResponse(claimed, response),
    )
    await step.run("complete-run", () => completeRunOutbox(outboxEventId, claimed))
    return { runId: claimed.runId, activityId: activity.id }
  },
)

export const processNovaApprovalDecision = inngest.createFunction(
  {
    id: "nova-process-approval-decision",
    concurrency: [
      { limit: 1, key: "event.data.approvalId" },
      { limit: 10 },
    ],
    retries: 4,
    onFailure: async ({ event, error }) => {
      const approvalId = event.data.event.data.approvalId as string | undefined
      if (!approvalId) return
      await failApprovalContinuation(approvalId, error)
    },
  },
  { event: "nova/approval.decided" },
  async ({ event, step }) => {
    const approvalId = event.data.approvalId as string | undefined
    if (!approvalId) return { ignored: true, reason: "missing_approval_id" }

    const execution = await step.run("execute-approved-mutation", () =>
      executeApprovedMutation(approvalId),
    )
    if (approvalContinuationIsTerminal(execution)) {
      await step.run("complete-terminal-continuation", () =>
        completeApprovalContinuation(approvalId),
      )
      return {
        runId: execution.runId,
        denied: execution.denied,
        replayed: execution.replayed,
      }
    }

    await step.run("verify-mutation-result", () =>
      transitionRun(execution.runId, "delivering"),
    )
    const activity = await step.run("persist-mutation-result", () =>
      createResponseActivity({
        agentSessionId: execution.agentSessionId,
        surfaceId: execution.surfaceId,
        runId: execution.runId,
        type: "result",
        title: "Approved action completed",
        body: "Nova completed the approved action.",
        data: { externalId: execution.resultId },
      }),
    )
    await step.run("complete-mutation-run", () =>
      completeMutationRun({
        runId: execution.runId,
        agentSessionId: execution.agentSessionId,
      }),
    )
    await step.run("complete-approval-continuation", () =>
      completeApprovalContinuation(approvalId),
    )
    return { runId: execution.runId, activityId: activity.id, denied: false }
  },
)

export const reconcileNovaRuns = inngest.createFunction(
  {
    id: "nova-reconcile-runs",
    retries: 2,
  },
  { cron: "*/1 * * * *" },
  async ({ step }) => {
    return step.run("publish-pending-runs", () => reconcileRunOutbox())
  },
)

export const reconcileNovaApprovalContinuations = inngest.createFunction(
  {
    id: "nova-reconcile-approval-continuations",
    retries: 2,
  },
  { cron: "*/1 * * * *" },
  async ({ step }) => {
    return step.run("publish-pending-approval-continuations", () =>
      reconcileApprovalContinuations(),
    )
  },
)

export const expireNovaApprovals = inngest.createFunction(
  {
    id: "nova-expire-approvals",
    retries: 2,
  },
  { cron: "*/1 * * * *" },
  async ({ step }) => {
    return step.run("expire-pending-approvals", () => expirePendingApprovals())
  },
)

export const reconcileNovaActivityDelivery = inngest.createFunction(
  {
    id: "nova-reconcile-activity-delivery",
    retries: 2,
  },
  { cron: "*/1 * * * *" },
  async ({ step }) => {
    return step.run("publish-pending-deliveries", async () => {
      return reconcileActivityDeliveryOutbox()
    })
  },
)

export const deliverNovaActivity = inngest.createFunction(
  {
    id: "nova-deliver-activity",
    concurrency: [
      { limit: 1, key: "event.data.activityId" },
      { limit: 20 },
    ],
    retries: 6,
  },
  { event: "nova/activity.delivery.requested" },
  async ({ event, step }) => {
    const activityId = event.data.activityId as string | undefined
    if (!activityId) return { ignored: true, reason: "missing_activity_id" }

    return step.run("deliver-provider-activity", async () => {
      return deliverActivity(activityId)
    })
  },
)
