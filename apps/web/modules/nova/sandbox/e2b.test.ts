import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { Sandbox } from "e2b"

import { pauseE2BSandbox } from "./e2b"

afterEach(() => mock.restore())

test("filesystem pause requests never restore process memory", async () => {
  const pause = spyOn(Sandbox, "pause").mockResolvedValue(true)
  const info = spyOn(Sandbox, "getInfo")
  await pauseE2BSandbox("disposable", { apiKey: "fixture" })
  expect(pause).toHaveBeenCalledWith("disposable", { apiKey: "fixture", mode: "filesystem" })
  expect(info).not.toHaveBeenCalled()
})

test("an SDK false response is only accepted when the sandbox is already paused", async () => {
  spyOn(Sandbox, "pause").mockResolvedValue(false)
  spyOn(Sandbox, "getInfo").mockResolvedValue({ state: "paused" } as Awaited<ReturnType<typeof Sandbox.getInfo>>)
  await expect(pauseE2BSandbox("disposable", { apiKey: "fixture" })).resolves.toBeUndefined()
})

test("a refused filesystem pause cannot release a running workspace", async () => {
  spyOn(Sandbox, "pause").mockResolvedValue(false)
  spyOn(Sandbox, "getInfo").mockResolvedValue({ state: "running" } as Awaited<ReturnType<typeof Sandbox.getInfo>>)
  await expect(pauseE2BSandbox("disposable", { apiKey: "fixture" })).rejects.toThrow("still requires recovery")
})

test("an ambiguous pause remains a failure if its state cannot be verified", async () => {
  spyOn(Sandbox, "pause").mockResolvedValue(false)
  spyOn(Sandbox, "getInfo").mockRejectedValue(new Error("Unavailable"))
  await expect(pauseE2BSandbox("disposable", { apiKey: "fixture" })).rejects.toThrow("Unavailable")
})
