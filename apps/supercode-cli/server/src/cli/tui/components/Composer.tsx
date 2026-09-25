import { theme } from "../theme.ts"

export function Composer(props: {
  value: string
  onInput: (v: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <box width="100%" border borderColor={theme.green} paddingLeft={1} height={3}>
      <input
        focused={!props.disabled}
        placeholder={props.placeholder ?? "Message, /model, /mode, /clear, /exit…"}
        value={props.value}
        onInput={props.onInput}
        onSubmit={props.onSubmit}
        textColor={theme.white}
        cursorColor={theme.amber}
      />
    </box>
  )
}
