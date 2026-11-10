import { describe, expect, test } from "bun:test"

import { agentInputSchema, agentUpdateSchema } from "./contracts"

describe("agent contracts", () => {
  test("requires a name and instructions when creating an agent", () => {
    expect(agentInputSchema.safeParse({ name: "", instructions: "" }).success).toBe(false)
    expect(agentInputSchema.parse({ name: "Reviewer", instructions: "Review code" }).name).toBe("Reviewer")
  })

  test("allows partial lifecycle updates", () => {
    expect(agentUpdateSchema.parse({ status: "archived" }).status).toBe("archived")
    expect(agentUpdateSchema.safeParse({ status: "deleted" }).success).toBe(false)
  })
})
