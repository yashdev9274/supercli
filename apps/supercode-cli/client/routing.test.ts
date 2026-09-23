import assert from "node:assert/strict"
import { describe, test } from "node:test"

import nextConfig from "./next.config"
import vercelConfig from "./vercel.json"

describe("API proxy routing", () => {
  test("proxies Composio routes in local and Vercel environments", async () => {
    const rewrites = await nextConfig.rewrites?.()
    const localRoutes = Array.isArray(rewrites) ? rewrites : []

    assert.ok(localRoutes.some((route) =>
      route.source === "/api/composio/:path*"
        && route.destination === "http://localhost:3004/api/composio/:path*"
    ))
    assert.ok(vercelConfig.rewrites.some((route) =>
      route.source === "/api/composio/:path*"
        && route.destination === "https://supercode-8w7e.onrender.com/api/composio/:path*"
    ))
  })
})
