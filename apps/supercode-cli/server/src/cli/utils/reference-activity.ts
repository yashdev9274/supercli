import type { FileReferenceEvent } from "src/runtime/workspace/file-search"
import { renderToolBlock, ToolTranscript } from "./tool-presentation"
import { sanitizeTerminalText, wrapTerminalText } from "./terminal-text"

export function renderReferenceActivity(transcript: ToolTranscript, event: FileReferenceEvent, width = 80, interactive = false): string {
  const name = event.phase === "lookup" ? "resolve_file_reference" : "read_file"
  const args = { path: event.path }
  const call = event.state === "start"
    ? transcript.start(name, args, event.id)
    : transcript.finish(name, args, event.result, event.id)
  if (event.phase === "read" && call.status === "completed") {
    call.references = ["Loaded into this turn's context"]
  }
  return renderToolBlock(call, { width, interactive, completionOnly: event.state === "end" })
}

/** A model phase, not a tool call or a claim about hidden reasoning content. */
export class AnalysisActivity {
  private startedAt?: number
  private finished = false
  constructor(private readonly files: string[], private readonly write: (text: string) => void, private readonly width = 80) {}
  start(now = Date.now()): void {
    if (this.startedAt !== undefined) return
    this.startedAt = now
    const context = this.files.length ? this.files.join(", ") : "request and available context"
    this.write(wrapTerminalText(sanitizeTerminalText(`  ANALYSIS · running\n  │ Model processing ${context}`), this.width).join("\n") + "\n")
  }
  /** Prepare for the next model step, without claiming it has started yet. */
  nextPhase(): void {
    if (!this.finished) return
    this.startedAt = undefined
    this.finished = false
  }
  status(now = Date.now()): string | undefined {
    if (this.startedAt === undefined || this.finished) return undefined
    return `ANALYSIS · ${((now - this.startedAt) / 1000).toFixed(1)}s · Esc cancel`
  }
  end(outcome: "completed" | "failed" | "cancelled", now = Date.now()): void {
    if (this.startedAt === undefined || this.finished) return
    this.finished = true
    this.write(wrapTerminalText(`  ANALYSIS · ${outcome} · ${((now - this.startedAt) / 1000).toFixed(1)}s`, this.width).join("\n") + "\n")
  }
}
