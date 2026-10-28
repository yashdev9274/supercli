import { describe, expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { proxy } from "../../proxy"
import { metadata } from "../../app/(nova-app)/layout"

function route(path: string, host = "nova.supercodeai.tech") {
  return proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }))
}

describe("Nova link previews", () => {
  test("rewrites public root separately from the authenticated app", () => {
    expect(route("/").headers.get("x-middleware-rewrite")).toBe("https://nova.supercodeai.tech/nova-app-internal")
    expect(route("/app").headers.get("x-middleware-rewrite")).toBe("https://nova.supercodeai.tech/nova-app-internal/app")
    expect(route("/?ref=share").headers.get("x-middleware-rewrite")).toBe("https://nova.supercodeai.tech/nova-app-internal?ref=share")
  })

  test("does not change main site or login routing", () => {
    expect(route("/", "supercodeai.tech").headers.get("x-middleware-rewrite")).toBeNull()
    expect(route("/login").headers.get("x-middleware-rewrite")).toBeNull()
  })

  test("uses the Nova domain and image for both social preview formats", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://nova.supercodeai.tech/")
    expect(metadata.openGraph?.images).toEqual([{
      url: "/Nova-OG-image.jpg",
      width: 1200,
      height: 630,
      alt: "Nova — your Supercode engineering agent",
    }])
    expect(metadata.twitter?.images).toEqual(["/Nova-OG-image.jpg"])
  })
})
