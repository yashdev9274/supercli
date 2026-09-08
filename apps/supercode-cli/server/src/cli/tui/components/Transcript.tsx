import { useTerminalDimensions } from "@opentui/react"
import { theme } from "../theme.ts"
import { layoutMarkdown } from "src/cli/utils/markdown-layout"
import { renderToolBlock, type ToolInvocation } from "src/cli/utils/tool-presentation"
import { sanitizeTerminalText } from "src/cli/utils/terminal-text"

export type TranscriptLine = {
  id: string
  kind: "user" | "assistant" | "reasoning" | "tool" | "system" | "error"
  text: string
  tool?: ToolInvocation
  expanded?: boolean
}

export function Transcript(props: { lines: TranscriptLine[]; reasoningExpanded?: boolean }) {
  const { width } = useTerminalDimensions()
  const colors = { plain: theme.white, heading: theme.green, strong: theme.white, em: theme.white, code: theme.amber, link: theme.greenGlow, muted: theme.muted }
  return (
    <scrollbox width="100%" flexGrow={1}>
      <box flexDirection="column" gap={1}>
        {props.lines.map((line) => {
          if (line.tool) return <text key={line.id} fg={line.tool.status === "failed" || line.tool.status === "denied" ? theme.red : theme.white}>{renderToolBlock(line.tool, { width: width - 4, expanded: line.expanded, interactive: true })}</text>
          if (line.kind === "assistant") return <box key={line.id} flexDirection="column">{layoutMarkdown(line.text, width - 4).map((row, i) => <text key={i}>{row.length ? row.map((span, j) => <span key={j} fg={process.env.NO_COLOR === undefined ? colors[span.style] : theme.white}>{span.style === "strong" || span.style === "heading" ? <b>{span.text}</b> : span.style === "em" ? <i>{span.text}</i> : span.text}</span>) : " "}</text>)}</box>
          return <text key={line.id} fg={line.kind === "error" ? theme.red : line.kind === "user" ? theme.amber : theme.muted}>{line.kind === "reasoning" ? props.reasoningExpanded ? `Thinking\n${sanitizeTerminalText(line.text)}` : "Thinking [Ctrl+T details]" : sanitizeTerminalText(line.text)}</text>
        })}
      </box>
    </scrollbox>
  )
}
