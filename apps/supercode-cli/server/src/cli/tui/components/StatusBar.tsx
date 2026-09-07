import { theme } from "../theme.ts"

export function StatusBar(props: { status: string }) {
  return (
    <box width="100%" border borderColor={theme.greenDim} paddingLeft={1}>
      <text fg={theme.greenMute}>{props.status}</text>
    </box>
  )
}
