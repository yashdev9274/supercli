import { describe, expect, it } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

import type { SettingsUsage } from "@/modules/nova/settings/service"
import { UsageSection } from "./settings-usage"

const usage = {
  periodLabel: "November 2026",
  periodStart: "2026-11-01T00:00:00Z",
  periodEnd: "2026-11-08T12:00:00Z",
  resetAt: "2026-12-01T00:00:00Z",
  allowanceCredits: 1000,
  balanceCredits: 640,
  spentCredits: 350,
  reservedCredits: 10,
  planName: "Free",
  planTier: "spark",
  isGrandfathered: false,
  categories: [
    { kind: "models", label: "Models", spentCredits: 200, reservedCredits: 10, requests: 20 },
    { kind: "machines", label: "Machines", spentCredits: 100, reservedCredits: 0, requests: 4 },
    { kind: "mcp", label: "MCP & apps", spentCredits: 50, reservedCredits: 0, requests: 10 },
  ],
  daily: [{ date: "2026-11-08", modelCredits: 200, machineCredits: 100, mcpCredits: 50 }],
  history: [{ id: "reservation", kind: "mcp", label: "GITHUB_LIST_ISSUES", credits: 0.4, status: "settled", createdAt: "2026-11-08T12:00:00Z" }],
  source: "ledger",
} satisfies SettingsUsage

function render(data: SettingsUsage | null, loading = false, error: string | null = null) {
  return renderToStaticMarkup(<UsageSection data={data} loading={loading} error={error} onRefresh={() => {}} />)
}

describe("Usage settings shared credit model", () => {
  it("shows the same 1000-credit allowance for new and grandfathered free users", () => {
    for (const isGrandfathered of [false, true]) {
      const html = render({ ...usage, isGrandfathered })
      expect(html).toContain("/ 1,000")
      expect(html).toContain("640")
      expect(html).toContain("350 used · 10 reserved")
      expect(html.includes("Grandfathered")).toBe(isGrandfathered)
    }
  })

  it("includes model, machine and MCP categories instead of dollar-only model analytics", () => {
    const html = render(usage)
    expect(html).toContain("Models credit usage")
    expect(html).toContain("Machines credit usage")
    expect(html).toContain("MCP &amp; apps credit usage")
    expect(html).toContain("GITHUB_LIST_ISSUES")
    expect(html).not.toContain("$")
    expect(html).toContain("BYOK exempts model inference only")
  })

  it("does not invent balances when loading or when the ledger is unavailable", () => {
    expect(render(null, true)).toContain("Loading")
    const html = render({ ...usage, source: "unavailable", allowanceCredits: null, balanceCredits: null, spentCredits: null, reservedCredits: null, categories: [], daily: [], history: [], message: "Ledger unavailable" })
    expect(html).toContain("Ledger unavailable")
    expect(html).not.toContain("1,000")
    expect(html).toContain("Usage history is unavailable")
  })

  it("shows an honest empty state and keeps tiny charges visible", () => {
    expect(render({ ...usage, history: [] })).toContain("No charges recorded for this period")
    expect(render({ ...usage, history: [{ ...usage.history[0], credits: 0.0001 }] })).toContain("&lt;0.01")
  })
})
