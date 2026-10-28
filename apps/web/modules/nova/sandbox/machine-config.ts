import { MACHINE_SIZES, machineSizeSchema, type MachineCapabilities, type MachineSize } from "./machine-sizes"
import { sandboxProvider } from "./policy"
import builtTemplates from "./machine-templates.json"

const configuredTemplates: Partial<Record<MachineSize, string>> = builtTemplates

type Environment = Record<string, string | undefined>
export function machineTemplateKey(size: Exclude<MachineSize, "default">): string {
  return `NOVA_E2B_TEMPLATE_${size.replaceAll("-", "_").toUpperCase()}`
}
export function resolveMachine(size: unknown = "default", env: Environment = process.env, templates: Partial<Record<MachineSize, string>> = configuredTemplates) {
  const id = machineSizeSchema.parse(size)
  const spec = MACHINE_SIZES.find((entry) => entry.id === id)!
  if (id === "default") return { ...spec, template: env.NOVA_E2B_TEMPLATE?.trim() || "base" }
  if (env.NOVA_SANDBOX_ENABLED !== "true" || (env.NOVA_SANDBOX_PROVIDER ?? "vercel") !== "e2b") {
    throw new Error("Machine size selection requires an enabled E2B cloud workspace. Select Default.")
  }
  const template = env[machineTemplateKey(id)]?.trim() || templates[id]?.trim()
  if (!template) throw new Error(`${spec.label} is not configured. Select an available machine size.`)
  return { ...spec, template }
}
export function machineCapabilities(env: Environment = process.env): MachineCapabilities {
  return { sizes: MACHINE_SIZES.map(({ id }) => {
    try { resolveMachine(id, env); return { id, available: true } }
    catch { return { id, available: false } }
  }) }
}
export function assertMachineResources(size: MachineSize, info: { cpuCount: number; memoryMB: number }, retained = false): void {
  const spec = MACHINE_SIZES.find((entry) => entry.id === size)!
  if (size === "default") return
  if (info.cpuCount !== spec.cpuCount || info.memoryMB !== spec.memoryMB) {
    throw new Error(retained
      ? "This thread already has a different machine size. Choose Default to keep its files, or start a new thread for the selected size."
      : "The configured E2B template does not match the selected machine size. Ask an administrator to fix the template configuration.")
  }
}
export function validateMachineSelection(size: unknown = "default"): MachineSize {
  const machine = resolveMachine(size)
  if (machine.id !== "default" && sandboxProvider() !== "e2b") throw new Error("Select Default for this sandbox provider")
  return machine.id
}
