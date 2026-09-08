import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { theme } from "./theme.ts"
import { Header } from "./components/Header.tsx"
import { StatusBar } from "./components/StatusBar.tsx"
import { Composer } from "./components/Composer.tsx"
import { Transcript, type TranscriptLine } from "./components/Transcript.tsx"
import type { SessionController } from "src/cli/session/session-controller.ts"
import { ToolTranscript } from "src/cli/utils/tool-presentation"
import { AnalysisActivity } from "src/cli/utils/reference-activity"
import { sanitizeTerminalText } from "src/cli/utils/terminal-text"
import type { TurnEvent } from "src/cli/runtime/event-bus.ts"

type Props = {
  subtitle?: string
  /** When set, composer runs real harness/proxy turns. */
  session?: SessionController
  provider?: string
  model?: string
  mode?: string
}

let lineSeq = 0
function nextId(prefix: string) {
  lineSeq += 1
  return `${prefix}-${lineSeq}`
}

/**
 * OpenTUI shell: header · transcript · status · composer.
 * With `session`, turns use runUnifiedTurn (all providers/models).
 */
export function App({ subtitle, session, provider, model, mode: initialMode }: Props) {
  const renderer = useRenderer()
  const { width } = useTerminalDimensions()
  const [input, setInput] = useState("")
  const [status, setStatus] = useState(
    session
      ? "ready — type a message or /exit"
      : "OpenTUI scaffold — press Esc or Ctrl+C to exit",
  )
  const [mode, setMode] = useState(initialMode ?? session?.getState().mode ?? "chat")
  const [busy, setBusy] = useState(false)
  const [lines, setLines] = useState<TranscriptLine[]>(() => {
    const seed: TranscriptLine[] = [
      {
        id: nextId("sys"),
        kind: "system",
        text: session
          ? "Supercode OpenTUI session (harness + event bus)."
          : "Supercode interactive shell (OpenTUI scaffold).",
      },
    ]
    if (subtitle) seed.push({ id: nextId("sys"), kind: "system", text: subtitle })
    if (!session) {
      seed.push({
        id: nextId("sys"),
        kind: "system",
        text: "Legacy chalk UI remains default until OpenTUI is fully defaulted.",
      })
    }
    return seed
  })

  const tools = useRef(new ToolTranscript())
  const turnId = useRef(0)
  const analysis = useRef<AnalysisActivity | null>(null)
  const pendingText = useRef("")
  const committedText = useRef("")
  const [reasoningExpanded, setReasoningExpanded] = useState(false)

  const append = useCallback((kind: TranscriptLine["kind"], text: string) => {
    if (!text) return
    setLines((prev) => [...prev, { id: nextId(kind), kind, text }])
  }, [])

  const onTurnEvent = useCallback(
    (event: TurnEvent) => {
      const beginAnalysis = () => {
        if (tools.current.calls.some((call) => call.status === "running")) return
        analysis.current ??= new AnalysisActivity([], (text) => append("system", text), width - 4)
        analysis.current.nextPhase()
        analysis.current.start()
        setStatus(analysis.current.status() ?? "model processing")
      }
      const updateTool = (call: ReturnType<ToolTranscript["start"]>) => {
        const id = `tool-${turnId.current}-${call.id}`
        const snapshot = { ...call }
        setLines((prev) => {
          const existing = prev.find((line) => line.id === id)
          return existing ? prev.map((line) => line.id === id ? { ...line, tool: snapshot } : line)
            : [...prev, { id, kind: "tool", text: "", tool: snapshot }]
        })
      }
      const flushText = () => {
        append("assistant", pendingText.current)
        committedText.current += pendingText.current
        pendingText.current = ""
      }
      switch (event.type) {
        case "status": setStatus(sanitizeTerminalText(event.message)); break
        case "reasoning":
          if (!event.delta) break
          beginAnalysis()
          setLines((prev) => {
            const last = prev.at(-1)
            if (last?.kind === "reasoning") return [...prev.slice(0, -1), { ...last, text: last.text + event.delta }]
            return [...prev, { id: nextId("reasoning"), kind: "reasoning", text: event.delta }]
          })
          break
        case "text":
          if (event.delta) beginAnalysis()
          pendingText.current += event.delta
          break
        case "tool_start":
          analysis.current?.end("completed")
          flushText()
          updateTool(tools.current.start(event.toolName, event.args, event.id))
          setStatus(`${tools.current.calls.at(-1)?.category} · running`)
          break
        case "tool_end": {
          const call = tools.current.finish(event.toolName, event.args, event.result, event.id)
          updateTool(call)
          setStatus(`${call.category} · ${call.status}`)
          break
        }
        case "finish": {
          analysis.current?.end(event.finishReason === "cancelled" ? "cancelled" : event.finishReason === "error" ? "failed" : "completed")
          for (const call of tools.current.settle(event.finishReason === "cancelled" ? "cancelled" : "failed")) updateTool(call)
          const final = event.text.startsWith(committedText.current) ? event.text.slice(committedText.current.length) : event.text
          if (final.trim()) { append("system", "RESULT"); append("assistant", final) }
          pendingText.current = ""
          setStatus(event.finishReason === "cancelled" ? "cancelled — ready" : "ready")
          break
        }
        case "error":
          analysis.current?.end(event.cause instanceof Error && event.cause.name === "AbortError" ? "cancelled" : "failed")
          flushText()
          for (const call of tools.current.settle(event.cause instanceof Error && event.cause.name === "AbortError" ? "cancelled" : "failed")) updateTool(call)
          append("error", event.message)
          setStatus("error")
          break
      }
    },
    [append, width],
  )

  useEffect(() => {
    if (!session) return
    return session.subscribe(onTurnEvent)
  }, [session, onTurnEvent])

  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => {
      const running = tools.current.calls.findLast((call) => call.status === "running")
      const label = running
        ? `${running.category} · running · ${((Date.now() - running.startedAt) / 1000).toFixed(1)}s`
        : analysis.current?.status()
      if (label) setStatus(label)
    }, 250)
    return () => clearInterval(timer)
  }, [busy])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "o") {
      setLines((prev) => {
        const latest = prev.findLast((line) => line.tool)
        return prev.map((line) => line === latest ? { ...line, expanded: !line.expanded } : line)
      })
    } else if (key.ctrl && key.name === "t") {
      setReasoningExpanded((open) => !open)
    } else if (key.name === "escape" && busy) {
      session?.abort()
      setStatus("cancelling…")
    } else if (key.ctrl && key.name === "c") {
      session?.abort()
      renderer.destroy()
    }
  })

  const handleSlash = async (value: string): Promise<boolean> => {
    const [cmd, ...rest] = value.slice(1).split(/\s+/)
    const arg = rest.join(" ").trim()
    switch (cmd) {
      case "exit":
      case "quit":
        session?.abort()
        renderer.destroy()
        return true
      case "clear":
        setLines([])
        setStatus("cleared")
        return true
      case "mode": {
        const next = arg || "chat"
        setMode(next)
        session?.setMode(next)
        append("system", `mode → ${next}`)
        setStatus(`mode ${next}`)
        return true
      }
      case "model": {
        if (!arg) {
          append("system", `model: ${provider ?? "?"} / ${model ?? "?"}`)
          return true
        }
        // provider/model or just model id
        const parts = arg.includes("/") ? arg.split("/") : [provider ?? "supercode", arg]
        const p = parts[0] ?? "supercode"
        const m = parts.slice(1).join("/") || arg
        session?.setModel(p, m)
        append("system", `model → ${p} / ${m}`)
        setStatus(`model ${m}`)
        return true
      }
      case "help":
        append("system", "/clear /mode [chat|plan|build] /model [provider/id] /exit")
        return true
      default:
        append("system", `unknown command /${cmd}`)
        return true
    }
  }

  const handleSubmit = async () => {
    const value = input.trim()
    if (!value || busy) return
    setInput("")

    if (value.startsWith("/")) {
      await handleSlash(value)
      return
    }

    if (!session) {
      append("user", `› ${value}`)
      append("assistant", `(echo) OpenTUI received: ${value}`)
      setStatus("ready")
      return
    }

    append("user", `› ${value}`)
    setBusy(true)
    setStatus("running…")
    pendingText.current = ""
    committedText.current = ""
    turnId.current += 1
    tools.current = new ToolTranscript()
    analysis.current = null
    try {
      await session.runUserTurn({ text: value })
    } catch (err) {
      append("error", err instanceof Error ? err.message : String(err))
      setStatus("error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.black}
      padding={1}
      gap={1}
    >
      <Header provider={provider} model={model} mode={mode} />
      <Transcript lines={lines} reasoningExpanded={reasoningExpanded} />
      <StatusBar status={`${busy ? `${status} · Esc cancel` : status} · Ctrl+O output · Ctrl+T reasoning`} />
      <Composer
        value={input}
        onInput={setInput}
        onSubmit={() => {
          void handleSubmit()
        }}
        disabled={busy}
      />
    </box>
  )
}
