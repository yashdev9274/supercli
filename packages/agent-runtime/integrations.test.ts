import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { INTEGRATION_IDS, INTEGRATIONS, integrationFor, isIntegrationId, isOpenAICompatibleIntegration, OPENAI_COMPATIBLE_BASE_URLS } from "./integrations"

test("every registered integration has a unique complete audit, without invented readiness", () => {
  expect(new Set(INTEGRATION_IDS).size).toBe(INTEGRATION_IDS.length)
  expect(INTEGRATIONS.map((entry) => entry.id)).toEqual([...INTEGRATION_IDS])
  for (const entry of INTEGRATIONS) {
    expect(entry.evidence.length).toBeGreaterThan(0)
    expect(entry.limitation.length).toBeGreaterThan(0)
    for (const path of [...entry.evidence, ...(entry.harnessPath?.evidence ?? [])]) expect(existsSync(new URL(`../../${path}`, import.meta.url))).toBe(true)
    expect(Object.keys(entry.capabilities)).toHaveLength(9)
    expect(isIntegrationId(entry.id)).toBe(true)
    if (isOpenAICompatibleIntegration(entry.id)) expect(entry.eveAdapter).toBe("openai-compatible-contract-tested")
    else if (entry.id === "anthropic") expect(entry.eveAdapter).toBe("anthropic-contract-tested")
    else if (entry.id !== "codex") expect(entry.eveAdapter).toBe("missing")
  }
  for (const value of ["", "made-up-provider", null, {}, 2]) expect(isIntegrationId(value)).toBe(false)
})

test("only explicitly pinned public endpoints have an OpenAI-compatible Eve adapter", () => {
  expect(Object.keys(OPENAI_COMPATIBLE_BASE_URLS)).toHaveLength(9)
  for (const id of ["custom", "ollama", "neon", "opencode", "google", "anthropic", "cursor"] as const) expect(isOpenAICompatibleIntegration(id)).toBe(false)
  for (const entry of INTEGRATIONS.filter((entry) => entry.eveAdapter === "openai-compatible-contract-tested")) {
    expect(entry.kind).toBe("model")
    expect(entry.capabilities.tools).toBe("unsupported")
    expect(entry.eveCapabilities?.tools).toBe("contract-tested")
  }
})

test("external agent activity is distinct from model tool execution", () => {
  expect(integrationFor("cursor")).toMatchObject({ kind: "agent", webTransport: "remote-job", eveAdapter: "missing" })
  expect(integrationFor("cursor").capabilities.tools).toBe("not-applicable")
  for (const id of ["claude-code", "github-copilot", "supergrok"] as const) expect(integrationFor(id).kind).toBe("unverified")
})

test("generic web paths cannot advertise upstream tool or continuation capabilities", () => {
  for (const entry of INTEGRATIONS.filter((entry) => entry.webTransport === "generic-text")) {
    expect(entry.capabilities.tools).toBe("unsupported")
    expect(entry.capabilities.continuation).toBe("unsupported")
    expect(entry.capabilities.streaming).toBe("implemented-unverified")
  }
  expect(integrationFor("codex").capabilities.tools).toBe("contract-tested")
})
