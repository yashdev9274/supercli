import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { modelLogo, PROVIDER_LOGOS } from "./model-logos"
import { ALL_MODELS, HARNESS_PROVIDERS } from "./models"

describe("model company logos", () => {
  test("every model and provider resolves to a local logo asset", () => {
    const logos = [...HARNESS_PROVIDERS.map((provider) => PROVIDER_LOGOS[provider.id]), ...ALL_MODELS.map(modelLogo)]
    for (const logo of logos) {
      expect(logo.src.startsWith("/")).toBe(true)
      expect(existsSync(resolve(import.meta.dir, "../../public", logo.src.slice(1)))).toBe(true)
    }
  })

  test("identifies model makers independently of the serving gateway", () => {
    const cases = [
      ["Claude Opus 5", "anthropic"],
      ["GPT-4o", "openai"],
      ["DeepSeek V4 Flash", "deepseek"],
      ["Kimi K3", "kimi"],
      ["Nemotron 70B", "nvidia"],
      ["Llama 3.3 70B", "meta"],
      ["Gemini 2.5 Flash", "gemini"],
      ["GLM 5.2", "zai"],
      ["Grok 3", "xai"],
    ]
    for (const [label, brand] of cases) {
      const matches = ALL_MODELS.filter((entry) => entry.label === label)
      expect(matches.length).toBeGreaterThan(0)
      for (const entry of matches) expect(modelLogo(entry).src).toBe(`/logos/models/${brand}.svg`)
    }
  })

  test("does not invent a maker for stealth models", () => {
    for (const entry of ALL_MODELS.filter((model) => model.id === "stealth/ox-alpha")) {
      expect(modelLogo(entry)).toEqual(PROVIDER_LOGOS[entry.provider])
    }
  })
})
