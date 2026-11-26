import { codexAccountId, createCodexCredentials, type CodexCredentialContext } from "@super/codex-runtime/credentials"
import { boundedJson, CodexError, refreshCodexTokens } from "@super/codex-runtime/provider"
import { z } from "zod"

import type { AgentUsage, AgentUsageWindow } from "./contracts"

const record = z.record(z.string(), z.unknown())
const percent = z.number().min(0).max(100)
const duration = z.number().int().positive().max(2_147_483_647)
const reset = z.number().int().nonnegative().max(253_402_300_799)
const plans = new Set([
  "guest", "free", "go", "plus", "pro", "prolite", "promax", "free_workspace", "team",
  "self_serve_business_prolite", "self_serve_business_usage_based", "business", "ent26",
  "enterprise_cbp_automation", "enterprise_cbp_usage_based", "education", "quorum", "k12",
  "enterprise", "edu", "edu_plus", "edu_pro", "sci", "sci_plus",
])

export function unavailableCodex(message = "Codex usage is unavailable. Please retry shortly."): AgentUsage {
  return { provider: "codex", label: "Codex", plan: null, status: "unavailable", message, windows: [] }
}

export function parseCodexUsage(payload: unknown): AgentUsage {
  const parsed = record.safeParse(payload)
  if (!parsed.success) return unavailableCodex()
  const plan = typeof parsed.data.plan_type === "string" && plans.has(parsed.data.plan_type) ? parsed.data.plan_type : null
  const limits = record.safeParse(parsed.data.rate_limit)
  const windows: AgentUsageWindow[] = []
  if (limits.success) {
    for (const [key, fallback] of [["primary_window", "Primary window"], ["secondary_window", "Secondary window"]]) {
      const window = record.safeParse(limits.data[key])
      if (!window.success) continue
      const used = percent.safeParse(window.data.used_percent)
      if (!used.success) continue
      const seconds = duration.safeParse(window.data.limit_window_seconds)
      const timestamp = reset.safeParse(window.data.reset_at)
      let label = fallback
      if (seconds.success) {
        const value = seconds.data
        label = value % 86400 === 0 ? `${value / 86400}d window`
          : value % 3600 === 0 ? `${value / 3600}h window`
            : value % 60 === 0 ? `${value / 60}m window` : `${value}s window`
      }
      windows.push({ label, remainingPercent: 100 - used.data, resetsAt: timestamp.success ? new Date(timestamp.data * 1000).toISOString() : null })
    }
  }
  return windows.length ? { provider: "codex", label: "Codex", plan, status: "available", windows }
    : { ...unavailableCodex("Codex did not report usage windows. Check your ChatGPT plan or retry later."), plan }
}

export async function readCodexUsage(context: CodexCredentialContext, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AgentUsage> {
  const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)])
  const credentials = createCodexCredentials(context, (tokens) => refreshCodexTokens(tokens, fetcher))
  try {
    let credential = await credentials.read(deadline)
    for (let attempt = 0; attempt < 2; attempt++) {
      deadline.throwIfAborted()
      const account = codexAccountId(credential.tokens)
      const response = await fetcher("https://chatgpt.com/backend-api/wham/usage", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${credential.tokens.access_token}`,
          Accept: "application/json",
          ...(account ? { "ChatGPT-Account-Id": account } : {}),
        },
        redirect: "error", cache: "no-store", signal: deadline,
      })
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel()
        credential = await credentials.rotate(credential, deadline)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        return unavailableCodex(response.status === 401 ? "Reconnect Codex in Settings → Models to check usage."
          : response.status === 403 ? "Check your ChatGPT workspace access, then retry usage."
            : "Codex usage is unavailable. Please retry shortly.")
      }
      return parseCodexUsage(await boundedJson(response))
    }
  } catch (error) {
    if (error instanceof CodexError && error.statusCode === 403) throw error
    return unavailableCodex(error instanceof CodexError && error.statusCode === 401
      ? "Reconnect Codex in Settings → Models to check usage." : undefined)
  }
  return unavailableCodex()
}
