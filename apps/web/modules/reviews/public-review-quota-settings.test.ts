import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { publicReviewQuotaLimits } from "./public-review-store"

const ENV_NAMES = [
  "PUBLIC_REVIEW_FETCH_GLOBAL_HOURLY",
  "PUBLIC_REVIEW_FETCH_CLIENT_HOURLY",
  "PUBLIC_REVIEW_AI_GLOBAL_HOURLY",
  "PUBLIC_REVIEW_AI_GLOBAL_DAILY",
  "PUBLIC_REVIEW_AI_CLIENT_DAILY",
  "PUBLIC_REVIEW_MAX_CONCURRENT",
]

describe("public review quota configuration", () => {
  let original: Array<string | undefined>

  beforeEach(() => {
    original = ENV_NAMES.map((name) => process.env[name])
    for (const name of ENV_NAMES) delete process.env[name]
  })

  afterEach(() => {
    for (const [index, name] of ENV_NAMES.entries()) {
      if (original[index] === undefined) delete process.env[name]
      else process.env[name] = original[index]
    }
  })

  test("allows ten daily new reviews without the previous two-review or six-load caps", () => {
    expect(publicReviewQuotaLimits()).toEqual({
      fetchGlobalHourly: 10,
      fetchClientHourly: 10,
      aiGlobalHourly: 10,
      aiGlobalDaily: 20,
      aiClientDaily: 10,
      concurrency: 2,
    })
  })

  test("preserves explicit deployment overrides", () => {
    process.env.PUBLIC_REVIEW_AI_CLIENT_DAILY = "5"
    process.env.PUBLIC_REVIEW_AI_GLOBAL_HOURLY = "15"
    expect(publicReviewQuotaLimits()).toMatchObject({ aiClientDaily: 5, aiGlobalHourly: 15 })
  })

  test("still treats zero as disabled and invalid limits as a service configuration error", () => {
    process.env.PUBLIC_REVIEW_AI_CLIENT_DAILY = "0"
    expect(publicReviewQuotaLimits().aiClientDaily).toBe(0)
    process.env.PUBLIC_REVIEW_AI_CLIENT_DAILY = "unlimited"
    expect(() => publicReviewQuotaLimits()).toThrow("Public review limits are not configured correctly")
  })
})
