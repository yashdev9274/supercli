import { z } from "zod"

export const machineSizeSchema = z.enum(["default", "1cpu-4gb", "2cpu-8gb", "4cpu-16gb", "8cpu-32gb", "16cpu-64gb"])
export type MachineSize = z.infer<typeof machineSizeSchema>
export const MACHINE_SIZES = [
  { id: "default", label: "Default", cpuCount: null, memoryMB: null },
  { id: "1cpu-4gb", label: "1 CPU / 4 GB", cpuCount: 1, memoryMB: 4096 },
  { id: "2cpu-8gb", label: "2 CPU / 8 GB", cpuCount: 2, memoryMB: 8192 },
  { id: "4cpu-16gb", label: "4 CPU / 16 GB", cpuCount: 4, memoryMB: 16384 },
  { id: "8cpu-32gb", label: "8 CPU / 32 GB", cpuCount: 8, memoryMB: 32768 },
  { id: "16cpu-64gb", label: "16 CPU / 64 GB", cpuCount: 16, memoryMB: 65536 },
] as const
export const machineCapabilitiesSchema = z.object({
  sizes: z.array(z.object({ id: machineSizeSchema, available: z.boolean() })).max(MACHINE_SIZES.length),
})
export type MachineCapabilities = z.infer<typeof machineCapabilitiesSchema>
// Product tier designation only; entitlement enforcement is deferred.
export function isPremiumMachineSize(size: MachineSize): boolean {
  return (MACHINE_SIZES.find((entry) => entry.id === size)!.cpuCount ?? 0) > 2
}

export function machineSizeLabel(size: MachineSize): string {
  return MACHINE_SIZES.find((entry) => entry.id === size)!.label
}
