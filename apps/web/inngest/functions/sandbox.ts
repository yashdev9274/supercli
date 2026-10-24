import { reconcileSandboxWorkspaces } from "@/modules/nova/sandbox/service"
import { inngest } from "../client"

export const reconcileNovaSandboxes = inngest.createFunction(
  { id: "nova-reconcile-sandboxes", retries: 2, concurrency: 1 },
  { cron: "*/5 * * * *" },
  async ({ step }) => step.run("recover-cloud-workspaces", reconcileSandboxWorkspaces),
)
