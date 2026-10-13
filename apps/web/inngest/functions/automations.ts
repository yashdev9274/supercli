import { inngest } from "@/inngest/client"
import {
  claimAutomationRun, classifyAutomationRun, createAutomationSession,
  executeAutomationRun, failAutomationRun, reconcileAutomations,
} from "@/modules/nova/automations/runner"

export const processNovaAutomation = inngest.createFunction({
  id: "nova-process-automation",
  concurrency: [{ limit: 1, key: "event.data.automationId" }, { limit: 10 }],
  retries: 2,
  onFailure: async ({ event }) => {
    const runId = event.data.event.data.runId as string | undefined
    if (runId) await failAutomationRun(runId)
  },
}, { event: "nova/automation.run" }, async ({ event, step }) => {
  const runId = event.data.runId as string | undefined
  if (!runId) return { ignored: true }
  const claimed = await step.run("reserve-run-budget", () => claimAutomationRun(runId))
  if (["completed", "filtered", "failed", "skipped", "replayed"].includes(claimed.status)) return claimed
  const shouldRun = await step.run("evaluate-run-criteria", () => classifyAutomationRun(runId))
  if (!shouldRun) return { status: "filtered" }
  const sessionId = await step.run("create-nova-thread", () => createAutomationSession(runId))
  await step.run("execute-nova-automation", () => executeAutomationRun(runId))
  return { status: "completed", sessionId }
})

export const scheduleNovaAutomations = inngest.createFunction({
  id: "nova-schedule-automations", retries: 2, concurrency: { limit: 1 },
}, { cron: "*/1 * * * *" }, async ({ event, step }) => {
  // Use the event timestamp, not worker wall clock, to keep retries in the same slot.
  return step.run("dispatch-scheduled-and-pending", () => reconcileAutomations(new Date(event.ts ?? Date.now())))
})
