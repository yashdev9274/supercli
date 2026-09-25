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
      isUnnotarizedBeta: false,
    })
  })

  test("identifies development artifacts as unnotarized beta downloads", () => {
    const beta = release.replace("universal.dmg", "universal-development.dmg")
    assert.deepEqual(resolveDesktopDownload(`  ${beta}  `), {
      url: beta,
      version: "0.1.0",
      checksumUrl: `${beta}.sha256`,
      isUnnotarizedBeta: true,
    })
  })

  test("fails closed for absent, unsafe and mismatched links", () => {
    for (const value of [
      undefined, "", "not a url", "javascript:alert(1)",
      release.replace("https:", "http:"),
      release.replace("github.com", "example.com"),
      release.replace("github.com", "user:password@github.com"),
      release.replace("/desktop-v0.1.0/", "/desktop-v0.2.0/"),
      release.replace("universal.dmg", "universal-beta.dmg"),
      release.replace("yashdev9274", "another-owner"),
      "https://github.com/yashdev9274/supercli/releases/latest/download/Supercode.dmg",
      `${release}?token=x`, `${release}#fragment`,
    ]) {
      assert.equal(resolveDesktopDownload(value), null)
      if (typeof value === "string") {
        assert.equal(resolveDesktopDownload(value.replace("universal.dmg", "universal-development.dmg")), null)
      }
    }
  })
})
