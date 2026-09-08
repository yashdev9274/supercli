import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { resolveDesktopDownload } from "./desktop-download"

const release = "https://github.com/yashdev9274/supercli/releases/download/desktop-v0.1.0/Supercode-0.1.0-universal.dmg"

describe("desktop download", () => {
  test("exposes a versioned universal release and its checksum", () => {
    assert.deepEqual(resolveDesktopDownload(release), {
      url: release,
      version: "0.1.0",
      checksumUrl: `${release}.sha256`,
    })
  })

  test("fails closed for absent, unsafe, development and mismatched links", () => {
    for (const value of [
      undefined, "", "not a url", "javascript:alert(1)",
      release.replace("https:", "http:"),
      release.replace("github.com", "example.com"),
      release.replace("github.com", "user:password@github.com"),
      release.replace("/desktop-v0.1.0/", "/desktop-v0.2.0/"),
      release.replace("universal.dmg", "universal-development.dmg"),
      "https://github.com/yashdev9274/supercli/releases/latest/download/Supercode.dmg",
      `${release}?token=x`, `${release}#fragment`,
    ]) {
      assert.equal(resolveDesktopDownload(value), null)
    }
  })
})
