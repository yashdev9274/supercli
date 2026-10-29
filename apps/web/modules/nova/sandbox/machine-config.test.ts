import { expect, test } from "bun:test"

import { assertMachineResources, resolveMachine } from "./machine-config"
import { isPremiumMachineSize, MACHINE_SIZES, machineSizeSchema } from "./machine-sizes"

const env = { NOVA_SANDBOX_ENABLED: "true", NOVA_SANDBOX_PROVIDER: "e2b" }

test("Premium designation starts above 2 CPU / 8 GB", () => {
  for (const size of MACHINE_SIZES) {
    expect(isPremiumMachineSize(size.id)).toBe((size.cpuCount ?? 0) > 2)
  }
  expect(isPremiumMachineSize("2cpu-8gb")).toBe(false)
  expect(isPremiumMachineSize("4cpu-16gb")).toBe(true)
})

test("templates require explicit mappings, with environment overrides taking precedence", () => {
  expect(resolveMachine("default", {}, {}).template).toBe("base")
  expect(() => resolveMachine("4cpu-16gb", env, {})).toThrow("not configured")
  expect(resolveMachine("1cpu-4gb", env, { "1cpu-4gb": "built-template" }).template).toBe("built-template")
  expect(resolveMachine("1cpu-4gb", { ...env, NOVA_E2B_TEMPLATE_1CPU_4GB: "override" }, { "1cpu-4gb": "built-template" }).template).toBe("override")
  expect(() => resolveMachine("1cpu-4gb", {}, { "1cpu-4gb": "built-template" })).toThrow("enabled E2B")
  expect(machineSizeSchema.safeParse("forged").success).toBe(false)
})

test("explicit resources must match; retained machines cannot be silently resized", () => {
  expect(() => assertMachineResources("2cpu-8gb", { cpuCount: 2, memoryMB: 8192 })).not.toThrow()
  expect(() => assertMachineResources("default", { cpuCount: 2, memoryMB: 512 })).not.toThrow()
  expect(() => assertMachineResources("4cpu-16gb", { cpuCount: 2, memoryMB: 8192 })).toThrow("does not match")
  expect(() => assertMachineResources("4cpu-16gb", { cpuCount: 2, memoryMB: 8192 }, true)).toThrow("start a new thread")
})
