import { theme } from "../theme.ts"

export type TranscriptLine = {
  id: string
  kind: "user" | "assistant" | "reasoning" | "tool" | "system" | "error"
  text: string
}

export function Transcript(props: { lines: TranscriptLine[] }) {
  const colorFor = (kind: TranscriptLine["kind"]) => {
    switch (kind) {
      case "user":
        return theme.amber
      case "reasoning":
        return theme.greenMute
      case "tool":
        return theme.greenGlow
      case "error":
        return theme.red
      case "system":
        return theme.muted
      default:
        return theme.white
    }
  }

  return (
    <scrollbox width="100%" flexGrow={1}>
      <box flexDirection="column" gap={0}>
        {props.lines.map((line) => (
          <text key={line.id} fg={colorFor(line.kind)}>
            {line.kind === "reasoning" ? `· ${line.text}` : line.kind === "tool" ? `⚙ ${line.text}` : line.text}
          </text>
        ))}
      </box>
    </scrollbox>
  )
}
