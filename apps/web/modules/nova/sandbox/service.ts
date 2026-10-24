import { createHash } from "node:crypto"
import { APIError, Sandbox } from "@vercel/sandbox"
import { NotFoundError, Sandbox as E2BSandbox } from "e2b"
import prisma from "@super/db"

import { getGithubTokenForUser } from "@/modules/github/lib/github"
import { createE2BWorkspace, e2bCredentials, e2bNetwork, E2BWorkspace } from "./e2b"
import { checkoutE2B } from "./e2b-checkout"
import { checkoutPolicy, executionPolicy, RETENTION_MS, sandboxCredentials, sandboxEnabled, sandboxProvider, VM_MS, WORKSPACE } from "./policy"
import { createToolExecutor, exportPatch, runBounded, sandboxTools } from "./tools"

export async function sandboxEligibility(userId: string, sessionId: string) {
  if (process.env.NOVA_SANDBOX_ENABLED !== "true") return null
  const session = await prisma.agentSession.findUnique({ where: { id: sessionId }, include: { localProject: true } })
  if (!session || !sandboxEnabled(userId, session.organizationId)) return null
  const project = session.localProject
  if (!project?.repositoryFullName || project.status !== "active") return null
  const membership = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: session.organizationId, userId } } })
  if (membership?.status !== "active" || project.userId !== userId || project.organizationId !== session.organizationId) throw new Error("Cloud workspace access denied")
  const repository = await prisma.repository.findFirst({ where: { userId, fullName: project.repositoryFullName }, select: { fullName: true } })
  if (!repository) throw new Error("Connect the selected GitHub repository before using cloud Agent mode")
  return { organizationId: session.organizationId, repositoryFullName: repository.fullName }
}

type WorkspaceInput = { userId: string; sessionId: string; runId: string; organizationId: string; repositoryFullName: string; signal: AbortSignal }

export async function openSandboxWorkspace(input: WorkspaceInput) {
  const provider = sandboxProvider()
  const credentials = provider === "vercel" ? sandboxCredentials() : (e2bCredentials(), {})
  const policy = executionPolicy()
  const domains = typeof policy === "object" ? Object.keys(policy.allow ?? {}) : []
  const sandboxName = `${provider === "e2b" ? "nova-e2b" : "nova"}-${createHash("sha256").update(JSON.stringify([input.organizationId, input.userId, input.sessionId, input.repositoryFullName])).digest("hex").slice(0, 40)}`
  const now = new Date()
  // Serialize quota checks across all workspace claims in this organization.
  const registry = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`nova-sandbox:${input.organizationId}`}, 0))`
    const busy = await tx.novaSandboxSession.count({ where: { organizationId: input.organizationId, leaseRunId: { not: null } } })
    if (busy >= 2) throw new Error("Cloud workspace concurrency limit reached (2 per organization)")
    let row = await tx.novaSandboxSession.findUnique({ where: { sandboxName } })
    if (row?.leaseRunId || row?.status === "recovering") throw new Error("This cloud workspace is busy or awaiting recovery; retry after cleanup")
    if (row && row.expiresAt <= now) throw new Error("Cloud workspace retention expired; start a new thread to avoid losing prior edits silently")
    if (row && !row.baseSha) throw new Error("Cloud workspace setup was interrupted; start a new thread")
    if (!row) row = await tx.novaSandboxSession.create({ data: {
      sandboxName, provider, agentSessionId: input.sessionId, organizationId: input.organizationId,
      userId: input.userId, repositoryFullName: input.repositoryFullName, expiresAt: new Date(Date.now() + RETENTION_MS),
    } })
    const claimed = await tx.novaSandboxSession.updateMany({ where: { id: row.id, leaseRunId: null, status: { not: "recovering" } }, data: {
      leaseRunId: input.runId, leaseExpiresAt: new Date(Date.now() + 660_000), status: "provisioning", lastUsedAt: now,
    } })
    if (claimed.count !== 1) throw new Error("Cloud workspace already claimed")
    await tx.agentRun.update({ where: { id: input.runId }, data: { executionTarget: "remote_sandbox", policySnapshot: { mode: "cloud_coding", provider, connectedApps: false, publication: false, vmTimeoutMs: VM_MS } } })
    return row
  })
  let sandbox: Sandbox | E2BWorkspace | undefined
  let baseSha = registry.baseSha ?? ""
  let closed = false
  const started = Date.now()
  const close = async () => {
    if (closed) return
    if (!sandbox) return // Keep lease for the reconciler if provider creation was ambiguous.
    await stopSandbox(sandbox)
    await prisma.$transaction(async (tx) => {
      await tx.novaSandboxSession.updateMany({ where: { id: registry.id, leaseRunId: input.runId }, data: {
        status: baseSha ? "stopped" : "failed", leaseRunId: null, leaseExpiresAt: null,
        snapshotId: sandbox instanceof E2BWorkspace ? null : sandbox?.currentSnapshotId ?? null, expiresAt: new Date(Date.now() + RETENTION_MS),
      } })
      await tx.novaUsageLedger.upsert({ where: { reservationKey: `sandbox:${input.runId}` }, create: {
        organizationId: input.organizationId, agentSessionId: input.sessionId, runId: input.runId,
        kind: "sandbox_wall_time", quantity: (Date.now() - started) / 1000, unit: "seconds", reservationKey: `sandbox:${input.runId}`,
        metadata: sandbox instanceof E2BWorkspace ? { provider } : { provider, vcpus: 2, memoryMb: 4096, activeCpuMs: sandbox?.activeCpuUsageMs ?? null, networkTransfer: sandbox?.networkTransfer ?? null },
      }, update: {} })
    })
    closed = true
  }
  try {
    input.signal.throwIfAborted()
    if (provider === "e2b") {
      if (registry.baseSha) {
        if (!registry.providerSandboxId) throw new Error("E2B workspace identity is missing")
        // Never recreate missing retained work, or restore background processes.
        sandbox = new E2BWorkspace(await E2BSandbox.connect(registry.providerSandboxId, { ...e2bCredentials(), timeoutMs: VM_MS, onResume: "reboot", signal: input.signal }))
        await sandbox.sandbox.updateNetwork(e2bNetwork(), { signal: input.signal })
        const check = await runBounded(sandbox, "/usr/bin/git", ["cat-file", "-e", registry.baseSha], { signal: input.signal })
        if (!check.successful) throw new Error("Cloud workspace base commit is unavailable")
      } else {
        const token = await getGithubTokenForUser(input.userId)
        sandbox = await createE2BWorkspace(sandboxName, input.signal)
        await prisma.novaSandboxSession.updateMany({ where: { id: registry.id, leaseRunId: input.runId }, data: { providerSandboxId: sandbox.sandbox.sandboxId } })
        await checkoutE2B(sandbox, input.repositoryFullName, token, input.signal)
        const head = await runBounded(sandbox, "/usr/bin/git", ["rev-parse", "HEAD"], { signal: input.signal })
        baseSha = head.stdout.trim()
        if (!head.successful || !/^[a-f0-9]{40}$/.test(baseSha)) throw new Error("Could not determine checkout base commit")
      }
    } else if (registry.baseSha) {
      // Never automatically recreate a missing snapshot or reset a dirty tree.
      sandbox = await Sandbox.get({ ...credentials, name: sandboxName, signal: input.signal })
      await sandbox.update({ networkPolicy: "deny-all", ports: [], timeout: VM_MS }, { signal: input.signal })
      // File operations resume the stopped VM under its credential-free policy.
      const check = await runBounded(sandbox, "/usr/bin/git", ["cat-file", "-e", registry.baseSha], { signal: input.signal })
      if (!check.successful) throw new Error("Cloud workspace base commit is unavailable; workspace was not reset")
    } else {
      const token = await getGithubTokenForUser(input.userId)
      sandbox = await Sandbox.create({ ...credentials, name: sandboxName, image: "vercel/sandbox/universal:latest", resources: { vcpus: 2 }, timeout: VM_MS, persistent: true, snapshotExpiration: RETENTION_MS, keepLastSnapshots: { count: 1 }, networkPolicy: checkoutPolicy(input.repositoryFullName, token), signal: input.signal })
      const clone = await runBounded(sandbox, "/usr/bin/git", ["-c", "credential.helper=", "-c", "core.hooksPath=/dev/null", "-c", "filter.lfs.required=false", "-c", "filter.lfs.smudge=", "clone", "--depth=1", "--", `https://github.com/${input.repositoryFullName}.git`, WORKSPACE], { signal: input.signal, cwd: "/vercel/sandbox", timeoutMs: 90_000 })
      if (!clone.successful) throw new Error("GitHub checkout failed; check repository access")
      const head = await runBounded(sandbox, "/usr/bin/git", ["rev-parse", "HEAD"], { signal: input.signal })
      baseSha = head.stdout.trim()
      if (!head.successful || !/^[a-f0-9]{40}$/.test(baseSha)) throw new Error("Could not determine checkout base commit")
    }
    // No repository-controlled code is executed while the GitHub broker is active.
    if (sandbox instanceof E2BWorkspace) await sandbox.sandbox.updateNetwork(e2bNetwork(domains), { signal: input.signal })
    else await sandbox.update({ networkPolicy: policy }, { signal: input.signal })
    await prisma.novaSandboxSession.updateMany({ where: { id: registry.id, leaseRunId: input.runId }, data: { baseSha, branch: "default", status: "running", providerSessionId: sandbox instanceof E2BWorkspace ? null : sandbox.currentSession().sessionId } })
    const activeSandbox = sandbox
    return {
      provider,
      tools: sandboxTools(),
      execute: createToolExecutor(activeSandbox, baseSha, input.signal),
      close,
      async savePatch() {
        // Stop background writers before resuming only the export command.
        await stopSandbox(activeSandbox)
        if (activeSandbox instanceof E2BWorkspace) await activeSandbox.resume()
        const patch = await exportPatch(activeSandbox, baseSha)
        if (!patch) return "Cloud workspace: no changes against the original checkout. Your local files were not modified."
        const artifact = await prisma.novaArtifact.create({ data: {
          agentSessionId: input.sessionId, runId: input.runId, type: "sandbox_patch", name: "nova-changes.patch",
          metadata: { userId: input.userId, organizationId: input.organizationId, provider, baseline: provider === "e2b" ? "github_archive" : "upstream_commit", baseSha, patch, expiresAt: new Date(Date.now() + RETENTION_MS).toISOString() },
        } })
        return `Cloud workspace · [Download patch](/api/nova/sessions/${input.sessionId}/artifacts/${artifact.id}). Your local files were not modified.`
      },
    }
  } catch {
    await close().catch(() => {})
    // Provider errors may contain request bodies with brokered credentials.
    throw new Error("Cloud workspace could not be prepared. Check sandbox configuration and GitHub access; existing work was not reset.")
  }
}

export async function stopSandbox(sandbox: Sandbox | E2BWorkspace): Promise<void> {
  if (sandbox instanceof E2BWorkspace) return sandbox.stop()
  let policyFailed = false
  try {
    await sandbox.update({ networkPolicy: "deny-all", ports: [] }, { signal: AbortSignal.timeout(10_000) })
  } catch {
    policyFailed = true
  }
  // A failed policy update must never prevent an independent stop attempt.
  await sandbox.stop({ signal: AbortSignal.timeout(60_000) })
  if (policyFailed) throw new Error("Cloud workspace stopped; network policy cleanup requires recovery")
}

export async function reconcileSandboxWorkspaces() {
  const rows = await prisma.novaSandboxSession.findMany({ where: { OR: [
    { leaseRunId: { not: null }, leaseExpiresAt: { lt: new Date() } },
    { leaseRunId: null, expiresAt: { lt: new Date() }, status: { not: "expired" } },
  ] }, take: 2, orderBy: { expiresAt: "asc" } })
  for (const row of rows) {
    // Claim cleanup before provider I/O to exclude concurrent workspace opens.
    const claimed = await prisma.novaSandboxSession.updateMany({
      where: { id: row.id, leaseRunId: row.leaseRunId, expiresAt: row.expiresAt, leaseExpiresAt: row.leaseExpiresAt },
      data: { status: "recovering" },
    })
    if (claimed.count !== 1) continue
    try {
      let snapshotId = row.snapshotId
      let missing = false
      try {
        if (row.provider === "e2b") {
          const options = { ...e2bCredentials(), signal: AbortSignal.timeout(60_000), requestTimeoutMs: 60_000 }
          const ids: string[] = []
          if (row.providerSandboxId) ids.push(row.providerSandboxId)
          else {
            // Recover ambiguous creation without ever allocating a replacement.
            const pages = E2BSandbox.list({ ...e2bCredentials(), query: { metadata: { app: "nova", workspace: row.sandboxName } } })
            while (pages.hasNext) {
              const page = await pages.nextItems(options)
              ids.push(...page.map((item) => item.sandboxId))
            }
          }
          missing = ids.length === 0
          for (const id of ids) {
            if (!row.leaseRunId || !row.baseSha) await E2BSandbox.kill(id, options)
            else {
              const info = await E2BSandbox.getInfo(id, options)
              if (info.state === "running") {
                let policyFailed = false
                try { await E2BSandbox.updateNetwork(id, e2bNetwork(), options) } catch { policyFailed = true }
                await E2BSandbox.pause(id, { ...options, mode: "filesystem" })
                if (policyFailed) throw new Error("E2B network cleanup requires recovery")
              }
            }
          }
          if (!row.baseSha) missing = true
        } else if (row.provider === "vercel" || !row.provider) {
          const sandbox = await Sandbox.get({ ...sandboxCredentials(), name: row.sandboxName, signal: AbortSignal.timeout(10_000) })
          if (row.leaseRunId) await stopSandbox(sandbox)
          else await sandbox.delete({ deleteOrphanSnapshots: true, signal: AbortSignal.timeout(20_000) })
          snapshotId = sandbox.currentSnapshotId ?? snapshotId
        } else throw new Error("Unknown workspace provider")
      } catch (error) {
        if (!(error instanceof NotFoundError) && (!(error instanceof APIError) || error.response.status !== 404)) throw error
        missing = true
      }
      await prisma.$transaction(async (tx) => {
        await tx.novaSandboxSession.updateMany({ where: { id: row.id, leaseRunId: row.leaseRunId, status: "recovering" }, data: { status: missing || !row.leaseRunId ? "expired" : "stopped", leaseRunId: null, leaseExpiresAt: null, snapshotId, ...(missing ? { expiresAt: new Date(0) } : {}) } })
        if (row.leaseRunId) {
          await tx.agentRun.updateMany({ where: { id: row.leaseRunId, status: { notIn: ["completed", "failed", "cancelled"] } }, data: { status: "failed", completedAt: new Date(), cancellationReason: "Cloud execution lease expired", version: { increment: 1 } } })
          await tx.agentSession.updateMany({ where: { id: row.agentSessionId, activeRunId: row.leaseRunId }, data: { activeRunId: null } })
        }
      })
    } catch {
      // Keep the lease: an ambiguous stop must not admit a second writer.
      console.warn("[nova/sandbox] recovery pending", row.id)
    }
  }
  await prisma.novaArtifact.deleteMany({ where: { type: "sandbox_patch", createdAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
  return { inspected: rows.length }
}
