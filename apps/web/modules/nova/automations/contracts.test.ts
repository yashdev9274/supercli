import { describe, expect, test } from "bun:test"

import { automationInputSchema, matchesTrigger } from "./contracts"

const base = {
  name: "Agent automation",
  instructions: "Investigate the event",
  model: "openai/gpt-4o",
  provider: "concentrateai",
  triggers: [{ type: "webhook" }],
  runAsMembershipId: "membership-1",
}

describe("automation agent integration", () => {
  test("accepts an optional agent selection", () => {
    expect(automationInputSchema.parse({ ...base, agentId: "agent-1" }).agentId).toBe("agent-1")
    expect(automationInputSchema.parse(base).agentId).toBe("")
  })

  test("keeps trigger matching independent of the selected agent", () => {
    const trigger = { type: "webhook" as const }
    expect(matchesTrigger(trigger, { organizationId: "org", deliveryId: "delivery", type: "webhook", text: "event", actor: "", bot: false, channel: "", repository: "", team: "", conclusion: "", reviewState: "" })).toBe(true)
  })
})
