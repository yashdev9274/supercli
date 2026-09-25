import { theme } from "../theme.ts"
import { version } from "../../../../package.json"

export function Header(props: {
  provider?: string
  model?: string
  mode?: string
}) {
  const right = [props.mode, props.provider, props.model].filter(Boolean).join(" · ")
  return (
    <box
      width="100%"
      border
      borderColor={theme.green}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <text fg={theme.green}>supercode v{version}</text>
      <text fg={theme.amber}>{right || "OpenTUI"}</text>
    </box>
  )
}
