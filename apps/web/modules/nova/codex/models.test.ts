import { describe, expect, test } from "bun:test"

import { parseCodexModels, validateCodexSelection } from "./models"

const model = { slug: "account-model", display_name: "Account Model" }

describe("Codex model discovery", () => {
  test("keeps account models when visibility is omitted", () => {
    expect(parseCodexModels({ models: [model] }).map((entry) => entry.id)).toEqual(["account-model"])
  })

  test("honors explicit hidden and picker flags", () => {
    const models = [
      { ...model, visibility: "list" },
      ...["hide", "hidden", "none"].map((visibility) => ({ ...model, slug: visibility, visibility, show_in_picker: true })),
      { ...model, slug: "not-in-picker", visibility: "list", show_in_picker: false },
    ]
    expect(parseCodexModels({ models }).map((entry) => entry.id)).toEqual(["account-model"])
  })

  test("normalizes picker presets and reasoning fields", () => {
    const [entry] = parseCodexModels({ models: [{
      model: "preset-model", id: "preset-id", display_name: "Preset", show_in_picker: true,
      supported_reasoning_efforts: [{ effort: "low" }, { effort: "high" }], default_reasoning_effort: "high",
    }] })
    expect(entry.id).toBe("preset-model")
    expect(entry.efforts).toEqual(["low", "high"])
    expect(entry.defaultEffort).toBe("high")
  })

  test("sorts, deduplicates, and ignores unsupported reasoning efforts", () => {
    const models = parseCodexModels({ models: [
      { ...model, priority: 10, supported_reasoning_levels: [{ effort: "future" }, { effort: "high" }, { effort: "high" }], default_reasoning_level: "future" },
      { ...model, priority: 1 },
      { ...model, slug: "first", priority: 0 },
    ] })
    expect(models.map((entry) => entry.id)).toEqual(["first", "account-model"])
    expect(models[1].efforts).toEqual(["high"])
    expect(models[1].defaultEffort).toBe("high")
    expect(validateCodexSelection(models, "account-model", "high")).toEqual(models[1])
    expect(() => validateCodexSelection(models, "missing")).toThrow("unavailable")
    expect(() => validateCodexSelection(models, "account-model", "low")).toThrow("not supported")
  })

  test("rejects malformed catalogs rather than presenting them as empty", () => {
    for (const body of [null, {}, { models: [{}] }, { models: [{ display_name: "No ID" }] }, { models: [{ ...model, visibility: "unknown" }] }]) {
      expect(() => parseCodexModels(body)).toThrow("Invalid Codex model catalog")
    }
    expect(parseCodexModels({ models: [] })).toEqual([])
  })
})
