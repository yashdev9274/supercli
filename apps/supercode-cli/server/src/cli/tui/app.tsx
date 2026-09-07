import { useKeyboard, useRenderer } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { theme } from "./theme.ts"
import { Header } from "./components/Header.tsx"
import { StatusBar } from "./components/StatusBar.tsx"
import { Composer } from "./components/Composer.tsx"
import { Transcript, type TranscriptLine } from "./components/Transcript.tsx"
import type { SessionController } from "src/cli/session/session-controller.ts"
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

  const reasoningOpen = useRef(false)

  const append = useCallback((kind: TranscriptLine["kind"], text: string) => {
    if (!text) return
    setLines((prev) => [...prev, { id: nextId(kind), kind, text }])
  }, [])

  const onTurnEvent = useCallback(
    (event: TurnEvent) => {
      switch (event.type) {
        case "status":
          setStatus(event.message)
          break
        case "reasoning":
          if (!reasoningOpen.current) {
            reasoningOpen.current = true
            append("system", "Thinking")
          }
          append("reasoning", event.delta.replace(/\n/g, " ").slice(0, 240))
          break
        case "text":
          // Streaming text accumulates on finish for cleaner Result block
          break
        case "tool_start":
          append("tool", `${event.toolName}…`)
          break
        case "tool_end":
          append("tool", `${event.toolName} done`)
          break
        case "finish":
          reasoningOpen.current = false
          if (event.reasoning && !event.text) {
            append("system", "(process only — no Result body)")
          }
          if (event.text) {
            append("system", "Result")
            for (const part of event.text.split("\n")) {
              append("assistant", part || " ")
            }
          }
          setStatus("ready")
          break
        case "error":
          append("error", event.message)
          setStatus("error")
          break
      }
    },
    [append],
  )

  useEffect(() => {
    if (!session) return
    return session.subscribe(onTurnEvent)
  }, [session, onTurnEvent])

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
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
    reasoningOpen.current = false
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
      <Transcript lines={lines} />
      <StatusBar status={busy ? `${status} (busy)` : status} />
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
