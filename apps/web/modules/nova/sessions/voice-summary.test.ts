import { describe, expect, it } from "bun:test"

import { spokenSummary } from "./voice-summary"

describe("spokenSummary", () => {
  it("keeps the first two sentences and drops markdown", () => {
    const answer = "## Vercel OSS\n\nVercel opened an OSS program for maintainers. It covers bandwidth and seats. Apply at [vercel.com](https://vercel.com)."
    expect(spokenSummary(answer)).toBe("Vercel opened an OSS program for maintainers. It covers bandwidth and seats.")
  })

  it("strips code blocks before speaking", () => {
    expect(spokenSummary("Here is the fix.\n```ts\nconst x = 1\n```\nShip it.")).toBe("Here is the fix. Ship it.")
  })

  it("says something when the answer was only code", () => {
    expect(spokenSummary("```ts\nconst x = 1\n```")).toBe("Done. I left the full result in your Nova thread.")
  })
})
