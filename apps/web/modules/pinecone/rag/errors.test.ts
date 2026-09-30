import { describe, expect, test } from "bun:test"

import { permanentEmbeddingFailureReason } from "./errors"

describe("permanent embedding failure detection", () => {
  test("detects exhausted credit in a nested AI SDK retry error", () => {
    const error = {
      name: "AI_RetryError",
      lastError: {
        name: "AI_APICallError",
        statusCode: 429,
        responseBody: JSON.stringify({
          error: {
            type: "insufficient_quota",
            code: "credit_balance_exhausted",
          },
        }),
      },
    }

    expect(permanentEmbeddingFailureReason(error)).toBe(
      "embedding provider credit balance exhausted",
    )
  })

  test("detects structured quota and billing codes", () => {
    expect(
      permanentEmbeddingFailureReason({
        statusCode: 429,
        data: { error: { code: "insufficient_quota" } },
      }),
    ).toBe("embedding provider quota exhausted")

    expect(
      permanentEmbeddingFailureReason({
        cause: { code: "billing_hard_limit_reached" },
      }),
    ).toBe("embedding provider billing limit reached")
  })

  test("does not classify ordinary rate limits or transient errors as permanent", () => {
    expect(
      permanentEmbeddingFailureReason({
        statusCode: 429,
        data: { error: { code: "rate_limit_exceeded" } },
      }),
    ).toBeNull()
    expect(permanentEmbeddingFailureReason(new Error("network timeout"))).toBeNull()
  })

  test("handles cyclic error causes", () => {
    const error: { cause?: unknown } = {}
    error.cause = error

    expect(permanentEmbeddingFailureReason(error)).toBeNull()
  })
})
