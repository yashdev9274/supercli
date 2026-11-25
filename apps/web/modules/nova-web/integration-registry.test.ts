import { expect, test } from "bun:test"
import { INTEGRATION_IDS, integrationFor } from "@super/agent-runtime/integrations"
import { PROVIDER_INTEGRATIONS, API_KEY_PROVIDER_IDS } from "./provider-integrations"
import { HARNESS_PROVIDERS, ALL_MODELS } from "./models"

test("the shared audit covers the complete UI and CLI-backed selection catalogs", () => {
  const exposed = new Set([...PROVIDER_INTEGRATIONS.map((entry) => entry.id), ...HARNESS_PROVIDERS.map((entry) => entry.id), ...ALL_MODELS.map((entry) => entry.provider)])
  expect([...exposed].sort()).toEqual([...INTEGRATION_IDS].sort())
  for (const id of exposed) expect(integrationFor(id).evidence.length).toBeGreaterThan(0)
})

test("provider-key storage is derived from registered credential types, not agent branding", () => {
  expect(API_KEY_PROVIDER_IDS).toContain("cursor")
  expect(API_KEY_PROVIDER_IDS).toContain("anthropic")
  expect(API_KEY_PROVIDER_IDS).not.toContain("codex")
  expect(API_KEY_PROVIDER_IDS).not.toContain("claude-code")
})
