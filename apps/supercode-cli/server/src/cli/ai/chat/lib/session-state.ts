/**
 * Module-scoped session state for chalk chat (stdin + streaming coordination).
 */
import type { PermissionPromptReply } from "src/tools/permission-manager.ts"
import type { PersistentStatusBar } from "src/cli/utils/tui.ts"
import type { StepStatusRow } from "../step-status-row.ts"

export let streamAbort: AbortController | null = null

export type ActiveChain = {
  thoughts: { endTime: number | null; subThoughts: { collapsed: boolean }[] }[]
  togglePrinted: (i: number) => void
  reprintThought: (i: number) => void
} | null

export let activeChain: ActiveChain = null
export let activeFooter: PersistentStatusBar | null = null
export let activeStatusRow: StepStatusRow | null = null

export let verboseMode = false

export type PermissionPromptSession = {
  isDangerous: boolean
  onReply: (reply: PermissionPromptReply) => void
  savedInput: string
  savedCursor: number
}

export let permissionPromptActive: PermissionPromptSession | null = null

export function setStreamAbort(c: AbortController | null) {
  streamAbort = c
}
export function setActiveChain(c: ActiveChain) {
  activeChain = c
}
export function setActiveFooter(f: PersistentStatusBar | null) {
  activeFooter = f
}
export function setActiveStatusRow(r: StepStatusRow | null) {
  activeStatusRow = r
}
export function setVerboseMode(v: boolean) {
  verboseMode = v
}
export function setPermissionPromptActive(s: PermissionPromptSession | null) {
  permissionPromptActive = s
}
