import { inngest } from "../client"
import { novaMaintenanceCronsEnabled, skipMaintenanceCron } from "../cron-guard"
import { dispatchEveRun, observeEveRun, failEveRun, reconcileEveRuns } from "@/modules/nova/eve/worker"

export const processEveCanary = inngest.createFunction({
  id: "nova-eve-canary-observer", retries: 3,
  concurrency: [{ limit: 1, key: "event.data.runId" }, { limit: 10 }],
  onFailure: async ({ event }) => {
    const runId = event.data.event.data.runId
    if (typeof runId === "string") await failEveRun(runId)
  },
}, { event: "nova/eve.dispatch.requested" }, async ({ event, step }) => {
  const runId = event.data.runId
  if (typeof runId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return { ignored: true }
  await step.run("idempotent-eve-admission", () => dispatchEveRun(runId))
  for (let batch = 0; batch < 1000; batch++) {
    const result = await step.run(`observe-${batch}`, () => observeEveRun(runId))
    if (result.terminal) return { runId, completed: true }
    await step.sleep(`wait-${batch}`, "1s")
  }
  await step.run("stop-observation-budget", () => failEveRun(runId))
  return { runId, completed: false }
})

export const reconcileEveCanary = inngest.createFunction({ id: "nova-eve-reconcile", retries: 1 }, { cron: "* * * * *" }, async ({ step }) => {
  if (!novaMaintenanceCronsEnabled() || process.env.NOVA_EVE_CANARY_ENABLED !== "true") return skipMaintenanceCron()
  return step.run("publish-pending-eve-runs", () => reconcileEveRuns())
})
