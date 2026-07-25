import { test, expect } from "bun:test"
import { compareVersions } from "./version"

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
