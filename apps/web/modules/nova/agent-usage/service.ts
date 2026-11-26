import type { CodexCredentialContext } from "@super/codex-runtime/credentials"

import { readCodexUsage } from "./codex"
import type { AgentUsage, AgentUsageSnapshot } from "./contracts"

export const codingProviderLabels: Record<string, string> = {
  cursor: "Cursor Cloud Agents",
  opencode: "OpenCode Go",
  kimi: "Kimi Code",
  "zai-coding": "GLM Coding Plan",
}

export async function agentUsageSnapshot(
  context: CodexCredentialContext,
  connectedProviders: Array<{ provider: string }>,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<AgentUsageSnapshot> {
  const row = await context.store.get()
  const agents: AgentUsage[] = []
  if (row.membershipId === context.owner.membershipId && row.state === "connected" && row.encryptedCredentials) {
    agents.push(await readCodexUsage(context, fetcher, signal))
  }
  for (const provider of Object.keys(codingProviderLabels)) {
    if (!connectedProviders.some((item) => item.provider === provider)) continue
    agents.push({
      provider, label: codingProviderLabels[provider], plan: null, status: "unavailable",
      message: "This connection does not expose remaining usage. Check usage in your provider account.",
      windows: [],
    })
  }
  return { updatedAt: new Date().toISOString(), agents }
}
