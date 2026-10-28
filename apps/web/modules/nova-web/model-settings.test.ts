import { describe, expect, test } from "bun:test"

import { filterSettingsModels, parseModelSelection, PROVIDER_CONFIGURATION } from "./model-settings"
import { ALL_MODELS, BYOK_PROVIDERS, HARNESS_PROVIDERS, menuId, modelsForProvider } from "./models"
import { normalizeSettingsSection, SETTINGS_SECTIONS } from "./settings-sections"

describe("Models settings", () => {
  test("renders Neon immediately after ConcentrateAI in provider order", () => {
    const providers = HARNESS_PROVIDERS.map((provider) => provider.id)
    expect(providers[providers.indexOf("concentrateai") + 1]).toBe("neon")
  })
  test("includes the entire catalog without collapsing provider variants", () => {
    expect(filterSettingsModels("  ", "all")).toEqual(ALL_MODELS)
    expect(new Set(ALL_MODELS.map(menuId)).size).toBe(ALL_MODELS.length)
  })

  test("has documented configuration and models for every provider", () => {
    for (const provider of HARNESS_PROVIDERS) {
      expect(PROVIDER_CONFIGURATION[provider.id].description.length).toBeGreaterThan(0)
      if (provider.id === "codex") {
        expect(PROVIDER_CONFIGURATION[provider.id].credential).toBe("ChatGPT subscription")
        expect(BYOK_PROVIDERS.some((entry) => entry.id === "codex")).toBe(false)
        expect(modelsForProvider(provider.id)).toEqual([])
      } else {
        expect(PROVIDER_CONFIGURATION[provider.id].credential).toMatch(/^[A-Z_]+$/)
        expect(modelsForProvider(provider.id).length).toBeGreaterThan(0)
      }
      expect(filterSettingsModels("", provider.id)).toEqual(modelsForProvider(provider.id))
    }
  })

  test("searches labels, IDs, descriptions and provider names case-insensitively", () => {
    expect(filterSettingsModels("  NVIDIA NIM  ", "all")).toEqual(modelsForProvider("nvidia"))
    expect(filterSettingsModels("MINIMAX-M2", "minimax").map((entry) => entry.id)).toEqual(["MiniMax-M2"])
    expect(filterSettingsModels("teaching optimized", "google").map((entry) => entry.id)).toEqual(["learnlm-1.5-pro"])
    expect(filterSettingsModels("claude", "openrouter").every((entry) => entry.provider === "openrouter")).toBe(true)
    expect(filterSettingsModels("no-such-model", "all")).toEqual([])
  })

  test("restores only exact catalog provider/model pairs", () => {
    const selection = { provider: "openrouter", model: "anthropic/claude-opus-5" } as const
    expect(parseModelSelection(JSON.stringify(selection))).toEqual(selection)
    for (const raw of [null, "bad json", "null", "42", "{}", "[]", JSON.stringify({ ...selection, provider: "unknown" }), JSON.stringify({ ...selection, model: "unknown" }), JSON.stringify({ provider: 4, model: [] })]) {
      expect(parseModelSelection(raw)).toBeNull()
    }
  })

  test("restores dynamic Codex models and all supported reasoning preferences", () => {
    for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"] as const) {
      const selection = { provider: "codex", model: "account-model", effort } as const
      expect(parseModelSelection(JSON.stringify(selection))).toEqual(selection)
    }
    expect(parseModelSelection(JSON.stringify({ provider: "codex", model: "" }))).toBeNull()
    expect(parseModelSelection(JSON.stringify({ provider: "codex", model: "x".repeat(129) }))).toBeNull()
    const selection = { provider: "openrouter", model: "anthropic/claude-opus-5" } as const
    for (const effort of ["none", "minimal", "unsupported"]) {
      expect(parseModelSelection(JSON.stringify({ ...selection, effort }))).toEqual(selection)
    }
  })

  test("accepts models settings and preserves existing sections", () => {
    for (const section of SETTINGS_SECTIONS) expect(normalizeSettingsSection(section)).toBe(section)
    expect(normalizeSettingsSection("models")).toBe("models")
    for (const value of [undefined, null, "", "unknown"]) expect(normalizeSettingsSection(value)).toBe("general")
  })
})
