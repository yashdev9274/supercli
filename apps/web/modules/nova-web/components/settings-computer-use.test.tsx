import { describe, expect, it } from "bun:test"
import { normalizeSettingsSection } from "../settings-sections"

describe("Computer use settings", () => {
  it("supports direct navigation", () => {
    expect(normalizeSettingsSection("computer-use")).toBe("computer-use")
    expect(normalizeSettingsSection("unknown")).toBe("general")
  })
})
