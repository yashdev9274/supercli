import { theme } from "../theme.ts"

/**
 * Phase 4 stub — wire to permission-manager ask flow.
 * When `open`, shows tool name + allow/deny hints (Esc cancels via parent).
 */
export function PermissionModal(props: {
  open: boolean
  toolName?: string
  detail?: string
}) {
  if (!props.open) return null
  return (
    <box
      width="100%"
      border
      borderColor={theme.amber}
      padding={1}
      flexDirection="column"
      gap={0}
    >
      <text fg={theme.amber}>Permission required</text>
      <text fg={theme.white}>{props.toolName ?? "tool"}</text>
      {props.detail ? <text fg={theme.muted}>{props.detail}</text> : null}
      <text fg={theme.greenMute}>Use existing permission-manager prompts (wired next).</text>
    </box>
  )
}
