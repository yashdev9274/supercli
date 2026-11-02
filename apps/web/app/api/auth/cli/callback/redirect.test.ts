import { describe, expect, test } from "bun:test"
import { NextRequest } from "next/server"

import { proxy } from "../../../../../proxy"
import { getNovaLoginRedirectUrl } from "./redirect"

const internalCallback = "http://localhost:3003/api/auth/cli/callback"

describe("Nova login redirect", () => {
  test("uses the browser host instead of Next.js's internal localhost origin", () => {
    const request = new Request(internalCallback, { headers: { host: "nova.localhost:3003" } })
    const destination = getNovaLoginRedirectUrl(request)
    expect(destination?.href).toBe("http://nova.localhost:3003/app")
    const response = proxy(new NextRequest(destination!, { headers: { host: destination!.host } }))
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/nova-app-internal/app")
  })

  test("prefers the first forwarded host as the routing proxy does", () => {
    const request = new Request(internalCallback, {
      headers: { host: "localhost:3003", "x-forwarded-host": " nova.localhost:3003, localhost:3003" },
    })
    expect(getNovaLoginRedirectUrl(request)?.href).toBe("http://nova.localhost:3003/app")
  })

  test("uses HTTPS for production regardless of the internal protocol", () => {
    const request = new Request(internalCallback, {
      headers: { "x-forwarded-host": "NOVA.SUPERCODEAI.TECH", "x-forwarded-proto": "http" },
    })
    expect(getNovaLoginRedirectUrl(request)?.href).toBe("https://nova.supercodeai.tech/app")
  })

  test("supports the other explicitly allowed local Nova port", () => {
    const request = new Request(internalCallback, { headers: { host: "nova.localhost:3000" } })
    expect(getNovaLoginRedirectUrl(request)?.href).toBe("http://nova.localhost:3000/app")
  })

  test("falls back to a public request URL when host headers are absent", () => {
    expect(getNovaLoginRedirectUrl(new Request("https://nova.supercodeai.tech/api/auth/cli/callback"))?.href)
      .toBe("https://nova.supercodeai.tech/app")
  })

  for (const host of ["localhost:3003", "evil.example", "nova.supercodeai.tech.evil.example", "nova.localhost:9999", "nova.supercodeai.tech@evil.example"]) {
    test(`rejects non-allowlisted host ${host}`, () => {
      expect(getNovaLoginRedirectUrl(new Request(internalCallback, { headers: { host } }))).toBeNull()
    })
  }

  test("does not ignore an untrusted forwarded host in favor of a trusted host", () => {
    const request = new Request(internalCallback, {
      headers: { host: "nova.localhost:3003", "x-forwarded-host": "evil.example" },
    })
    expect(getNovaLoginRedirectUrl(request)).toBeNull()
  })
})
