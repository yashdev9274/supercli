import { novaMaintenanceCronsEnabled, skipMaintenanceCron } from "@/inngest/cron-guard"
import { reconcileSandboxWorkspaces } from "@/modules/nova/sandbox/service"
import { inngest } from "../client"

export const reconcileNovaSandboxes = inngest.createFunction(
  { id: "nova-reconcile-sandboxes", retries: 2, concurrency: 1 },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    if (!novaMaintenanceCronsEnabled()) return skipMaintenanceCron()
    return step.run("recover-cloud-workspaces", reconcileSandboxWorkspaces)
  },
)
