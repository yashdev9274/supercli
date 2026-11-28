import { describe, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { CuaAdapter } from "./adapter"

const executablePath = fileURLToPath(new URL("./fake-driver.js", import.meta.url))

describe("local Cua adapter", () => {
  test("requires explicit enablement and an absolute executable", async () => {
    await expect(CuaAdapter.connect({ executablePath })).rejects.toThrow()
    await expect(CuaAdapter.connect({ enabled: true })).rejects.toThrow()
    await expect(CuaAdapter.connect({ enabled: true, executablePath: "cua-driver" })).rejects.toThrow()
    await expect(CuaAdapter.connect({ enabled: true, executablePath: "/does-not-exist" })).rejects.toThrow()
  })

  test("uses only approved calls and strips sensitive content", async () => {
    const adapter = await CuaAdapter.connect({ enabled: true, executablePath })
    try {
      await expect(adapter.call("click", {})).rejects.toThrow()
      await expect(adapter.call("get_window_state", { pid: 1, window_id: 2, screenshot_out_file: "/tmp/test" })).rejects.toThrow()
      const result = await adapter.call("get_window_state", { pid: 1, window_id: 2 })
      expect(result.items).toHaveLength(100)
      expect(result.truncated).toBe(true)
      expect(result.image).toBe("unsupported")
      expect(JSON.stringify(result)).not.toContain("secret")
      expect(JSON.stringify(result)).not.toContain("c2VjcmV0")
      expect((await adapter.call("list_apps", {})).items[0]).toEqual({ pid: 123, window_id: 456 })
      expect((await adapter.call("list_windows", {})).items).toHaveLength(100)
    } finally { await adapter.close() }
  })

  test("cancels in-flight calls", async () => {
    const adapter = await CuaAdapter.connect({ enabled: true, executablePath })
    try {
      const controller = new AbortController()
      const call = adapter.call("get_window_state", { pid: 99, window_id: 1 }, { signal: controller.signal })
      controller.abort()
      await expect(call).rejects.toThrow("cancelled")
    } finally { await adapter.close() }
  })

  test("rejects oversized unterminated responses", async () => {
    const adapter = await CuaAdapter.connect({ enabled: true, executablePath })
    try {
      await expect(adapter.call("get_window_state", { pid: 88, window_id: 1 })).rejects.toThrow()
    } finally { await adapter.close() }
  })

  test("closes even when a helper inherits the driver's output pipes", async () => {
    const adapter = await CuaAdapter.connect({ enabled: true, executablePath })
    await adapter.call("get_window_state", { pid: 77, window_id: 1 })
    const start = Date.now()
    await adapter.close()
    expect(Date.now() - start).toBeLessThan(1500)
  })
})
