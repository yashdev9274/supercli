import { describe, expect, it } from "bun:test"

import { spokenSummary } from "./voice-summary"

describe("spokenSummary", () => {
  it("does not clip a long spoken answer in the middle of a word", () => {
    const summary = spokenSummary("Vercel " + "deployments ".repeat(40))
    expect(summary.length).toBeLessThanOrEqual(320)
    expect(summary).toEndWith("deployments...")
  })
  it("keeps product names and an unpunctuated final sentence intact", () => {
    expect(spokenSummary("Vercel created Next.js. It hosts web applications")).toBe("Vercel created Next.js. It hosts web applications")
  })
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
