import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"

const requests: { url: string; init?: RequestInit }[] = []
let responseStatus = 200
let responseBody: unknown = {}
let networkFailure = false
const fetchMock = spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  requests.push({ url: String(input), init })
  if (networkFailure) throw new TypeError("Failed to fetch")
  return Response.json(responseBody, { status: responseStatus })
})

// Import after installing fetch so Better Auth captures the mocked transport.
const { authClient } = await import("./auth-client")

afterAll(() => fetchMock.mockRestore())
beforeEach(() => {
  requests.length = 0
  responseStatus = 200
  responseBody = {}
  networkFailure = false
})

describe("same-origin authentication proxy", () => {
  test("GitHub sign-in uses the proxy and preserves the Nova callback", async () => {
    const callbackURL = "https://supercode-terminal.vercel.app/sign-in?redirect=https%3A%2F%2Fnova.supercodeai.tech%2Fapp"
    responseBody = { url: "https://github.com/login/oauth/authorize", redirect: false }

    await authClient.signIn.social({ provider: "github", callbackURL })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe("/api/auth/sign-in/social")
    expect(requests[0].init?.credentials).toBe("include")
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      provider: "github",
      callbackURL,
    })
  })

  test("session checks use the same-origin proxy", async () => {
    responseBody = null
    await authClient.getSession()
    expect(requests[0].url).toBe("/api/auth/get-session")
  })

  test("Nova one-time tokens use the same-origin proxy", async () => {
    responseBody = { token: "test-one-time-token" }
    const result = await authClient.oneTimeToken.generate()
    expect(requests[0].url).toBe("/api/auth/one-time-token/generate")
    expect(result.data?.token).toBe("test-one-time-token")
  })

  test("HTTP sign-in failures are returned for the form to display", async () => {
    responseStatus = 503
    responseBody = { message: "Authentication unavailable" }
    const result = await authClient.signIn.social({ provider: "github" })
    expect(result.error).toBeTruthy()
    expect(requests[0].url).toBe("/api/auth/sign-in/social")
  })

  test("network failures reject for the form to catch", async () => {
    networkFailure = true
    await expect(authClient.signIn.social({ provider: "github" })).rejects.toThrow("Failed to fetch")
  })
})
