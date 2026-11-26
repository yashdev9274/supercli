"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  formatWorkDuration,
  type WorkingStep,
  type WorkingStepChild,
} from "@/modules/nova-web/working-steps"

function FileChip({
  language,
  path,
  range,
}: {
  language?: string
  path: string
  range?: string
}) {
  const lang = (language || "file").toLowerCase()
  const tone =
    lang === "tsx" || lang === "jsx"
      ? "bg-[#f472b6]/15 text-[#f9a8d4]"
      : lang === "ts" || lang === "js"
        ? "bg-[#2dd4bf]/15 text-[#5eead4]"
        : lang === "css"
          ? "bg-sky-400/15 text-sky-300"
          : lang === "json"
            ? "bg-amber-400/15 text-amber-200"
            : "bg-white/[0.06] text-[#b0b0b0]"

  const name = path.split("/").pop() || path

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
      <span className={cn("rounded px-1 py-px font-mono text-[10px] font-medium leading-4", tone)}>
        {lang}
      </span>
      <span className="truncate font-mono text-[12.5px] text-[#8ec9c0]">{name}</span>
      {range ? <span className="font-mono text-[11px] text-[#85858e]">{range}</span> : null}
    </span>
  )
}

function DiffChip({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions == null && deletions == null) return null
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 font-mono text-[11.5px]">
      {additions != null ? <span className="text-emerald-400/90">+{additions}</span> : null}
      {deletions != null ? <span className="text-red-400/80">-{deletions}</span> : null}
    </span>
  )
}

function StepLine({ step, nested = false }: { step: WorkingStep; nested?: boolean }) {
  const [open, setOpen] = useState(true)
  const hasChildren = Boolean(step.children && step.children.length > 0)
  const isActive = step.status === "active"

  if (step.kind === "write" && step.meta?.path) {
    return (
      <p className={cn("text-[12.5px] leading-5 text-[#92929b]", nested && "pl-0")}>
        <span className="text-[#a1a1aa]">Writing </span>
        <FileChip language={step.meta.language} path={step.meta.path} />
        <DiffChip additions={step.meta.additions} deletions={step.meta.deletions} />
      </p>
    )
  }

  if (step.kind === "read" && step.meta?.path) {
    return (
      <p className="text-[12.5px] leading-5 text-[#92929b]">
        <span className="text-[#a1a1aa]">Reading </span>
        <FileChip language={step.meta.language} path={step.meta.path} />
      </p>
    )
  }

  if (step.kind === "explore" && hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group flex items-center gap-1 text-[12.5px] leading-5 text-[#92929b] transition hover:text-[#a0a0a0]"
        >
          {open ? (
            <ChevronDown className="size-3 opacity-70" />
          ) : (
            <ChevronRight className="size-3 opacity-70" />
          )}
          <span>{step.label}</span>
        </button>
        {open ? (
          <ul className="mt-1 space-y-1 border-l border-white/[0.08] pl-3 ml-1.5">
            {step.children!.map((child) => (
              <li key={child.id}>
                <ChildLine child={child} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <p
      className={cn(
        "text-[12.5px] leading-5",
        isActive ? "text-[#a1a1aa]" : "text-[#92929b]",
      )}
    >
      {isActive && step.kind === "thinking" ? (
        <span className="inline-flex items-center gap-2">
          <span className="size-1 animate-pulse rounded-full bg-[#2dd4bf]/80" />
          {step.label}
        </span>
      ) : (
        step.label
      )}
    </p>
  )
}

function ChildLine({ child }: { child: WorkingStepChild }) {
  if (child.path) {
    return (
      <p className="text-[12.5px] leading-5 text-[#92929b]">
        <span className="text-[#a1a1aa]">{child.label} </span>
        <FileChip language={child.language} path={child.path} range={child.range} />
      </p>
    )
  }
  return <p className="text-[12.5px] leading-5 text-[#92929b]">{child.label}</p>
}

function WorkingDots() {
  return (
    <span className="inline-grid grid-cols-2 gap-[2px]" aria-hidden>
      <span className="size-[3px] rounded-[0.5px] bg-[#5c5c5c] animate-pulse" style={{ animationDelay: "0ms" }} />
      <span className="size-[3px] rounded-[0.5px] bg-[#5c5c5c] animate-pulse" style={{ animationDelay: "120ms" }} />
      <span className="size-[3px] rounded-[0.5px] bg-[#5c5c5c] animate-pulse" style={{ animationDelay: "240ms" }} />
      <span className="size-[3px] rounded-[0.5px] bg-[#5c5c5c] animate-pulse" style={{ animationDelay: "360ms" }} />
    </span>
  )
}

export function WorkedForLine({ ms, className }: { ms: number; className?: string }) {
  if (ms < 500) return null
  return (
    <p className={cn("text-[12.5px] leading-5 text-[#85858e]", className)}>
      Worked for {formatWorkDuration(ms)}
    </p>
  )
}

/**
 * Capy-style live working block:
 * Working for 1m 9s ▾
 *   Inspected …
 *   Thinking for 4s
 *   Reading ts contracts.ts
 * ⋮⋮ Nova is working
 */
export function WorkingProcess({
  steps,
  workingSince,
  workingUntil,
  streaming,
  agentName = "Nova",
  defaultOpen,
}: {
  steps: WorkingStep[]
  workingSince: number | null
  /** When the turn finished; used for stable "Worked for" duration. */
  workingUntil?: number | null
  streaming: boolean
  agentName?: string
  /** Defaults to open while streaming, collapsed after (Capy-style). */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? streaming)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Auto-expand while live; collapse once the turn settles so the answer leads.
    setOpen(defaultOpen ?? streaming)
  }, [streaming, defaultOpen])

  useEffect(() => {
    if (!streaming || !workingSince) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [streaming, workingSince])

  if (!streaming && steps.length === 0) return null

  const end = streaming ? now : (workingUntil ?? now)
  const elapsed = workingSince ? Math.max(0, end - workingSince) : 0
  const header = streaming
    ? `Working for ${formatWorkDuration(elapsed)}`
    : `Worked for ${formatWorkDuration(elapsed)}`

  return (
    <div className="my-3 select-none rounded-xl border border-white/[0.08] bg-[#151517] px-3.5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex items-center gap-1 text-[12.5px] leading-5 text-[#92929b] transition hover:text-[#9a9a9a]"
        aria-expanded={open}
      >
        <span>{header}</span>
        {open ? (
          <ChevronDown className="size-3.5 opacity-60 transition group-hover:opacity-90" />
        ) : (
          <ChevronRight className="size-3.5 opacity-60 transition group-hover:opacity-90" />
        )}
      </button>

      {open ? (
        <div className="mt-1.5 space-y-1 pl-0.5">
          {steps.length === 0 && streaming ? (
            <p className="flex items-center gap-2 text-[12.5px] leading-5 text-[#92929b]">
              <span className="size-1 animate-pulse rounded-full bg-[#2dd4bf]/80" />
              Starting…
            </p>
          ) : (
            steps.map((step) => <StepLine key={step.id} step={step} />)
          )}
        </div>
      ) : null}

      {streaming ? (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] leading-5 text-[#85858e]">
          <WorkingDots />
          <span>{agentName} is working</span>
        </p>
      ) : null}
    </div>
  )
}

export function StreamingAnswer({ text }: { text: string }) {
  if (!text) return null
  return null // rendered by parent via MarkdownBody
}
