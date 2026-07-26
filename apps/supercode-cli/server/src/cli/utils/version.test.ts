import { test, expect, mock } from "bun:test"
import { compareVersions, fetchLatestVersion } from "./version"

test("compareVersions returns 0 for equal versions", () => {
  expect(compareVersions("0.1.0", "0.1.0")).toBe(0)
  expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
  expect(compareVersions("0.1.90", "0.1.90")).toBe(0)
})

test("compareVersions returns -1 when first is older", () => {
  expect(compareVersions("0.1.0", "0.2.0")).toBe(-1)
  expect(compareVersions("1.0.0", "1.1.0")).toBe(-1)
  expect(compareVersions("0.1.89", "0.1.90")).toBe(-1)
  expect(compareVersions("0.1.90", "0.2.0")).toBe(-1)
  expect(compareVersions("2.0.0", "10.0.0")).toBe(-1)
})

test("compareVersions returns 1 when first is newer", () => {
  expect(compareVersions("0.2.0", "0.1.0")).toBe(1)
  expect(compareVersions("1.1.0", "1.0.0")).toBe(1)
  expect(compareVersions("0.1.90", "0.1.89")).toBe(1)
  expect(compareVersions("0.2.0", "0.1.90")).toBe(1)
  expect(compareVersions("10.0.0", "2.0.0")).toBe(1)
})

test("compareVersions handles versions with v prefix", () => {
  expect(compareVersions("v0.1.0", "0.1.0")).toBe(0)
  expect(compareVersions("v1.0.0", "1.0.0")).toBe(0)
})

test("compareVersions handles different length versions", () => {
  expect(compareVersions("1.0", "1.0.0")).toBe(0)
  expect(compareVersions("1.0", "1.0.1")).toBe(-1)
  expect(compareVersions("1.0.1", "1.0")).toBe(1)
})

test("compareVersions returns null for invalid versions", () => {
  expect(compareVersions("invalid", "1.0.0")).toBeNull()
  expect(compareVersions("1.0.0", "invalid")).toBeNull()
  expect(compareVersions("", "1.0.0")).toBeNull()
  expect(compareVersions("1.0.0", "")).toBeNull()
})

test("compareVersions rejects malformed semver suffixes", () => {
  expect(compareVersions("1.2.3foo", "1.2.3")).toBeNull()
  expect(compareVersions("1.2.3", "1.2.3foo")).toBeNull()
  expect(compareVersions("1.2.3.", "1.2.3")).toBeNull()
  expect(compareVersions("1.2.3.", "1.2.3")).toBeNull()
})

test("compareVersions orders prereleases below stable", () => {
  expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1)
  expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(1)
  expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1)
  expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1)
})

test("compareVersions orders prerelease numeric identifiers correctly", () => {
  expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(-1)
  expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.1")).toBe(1)
  expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.1")).toBe(0)
})

test("compareVersions treats non-numeric prerelease identifiers correctly", () => {
  // "1a" is non-numeric, "2" is numeric; per semver, numeric < string
  expect(compareVersions("1.0.0-alpha.1a", "1.0.0-alpha.2")).toBe(1)
  expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.1a")).toBe(-1)
})

test("compareVersions handles variable-length prerelease identifiers", () => {
  // More prerelease fields = higher precedence per semver spec
  expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1)
  expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha")).toBe(1)
})

test("compareVersions handles build metadata gracefully", () => {
  expect(compareVersions("1.0.0+build123", "1.0.0")).toBe(0)
  expect(compareVersions("1.0.0", "1.0.0+build123")).toBe(0)
})

test("fetchLatestVersion returns version string on success", async () => {
  const orig = globalThis.fetch
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify({ version: "1.2.3" }))),
  ) as unknown as typeof fetch
  expect(await fetchLatestVersion("test-pkg")).toBe("1.2.3")
  globalThis.fetch = orig
})

test("fetchLatestVersion returns null on non-ok response", async () => {
  const orig = globalThis.fetch
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(null, { status: 404 })),
  ) as unknown as typeof fetch
  expect(await fetchLatestVersion("test-pkg")).toBeNull()
  globalThis.fetch = orig
})

test("fetchLatestVersion returns null on malformed json response", async () => {
  const orig = globalThis.fetch
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify({}))),
  ) as unknown as typeof fetch
  expect(await fetchLatestVersion("test-pkg")).toBeNull()
  globalThis.fetch = orig
})

test("fetchLatestVersion returns null on network error", async () => {
  const orig = globalThis.fetch
  globalThis.fetch = mock(() => Promise.reject(new Error("network error"))) as unknown as typeof fetch
  expect(await fetchLatestVersion("test-pkg")).toBeNull()
  globalThis.fetch = orig
})
