"use client"

import { useEffect, useId, useState } from "react"
import { Check, ChevronDown, ChevronRight, Circle, Laptop, Loader2, X } from "lucide-react"

import { subagentElapsed, type WorkspaceSubagent } from "../subagents"

function useSubagentClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function Status({ child }: { child: WorkspaceSubagent }) {
  const Icon = child.status === "working" ? Loader2 : child.status === "done" ? Check : child.status === "failed" || child.status === "cancelled" ? X : Circle
  return <Icon aria-hidden="true" className={`size-3 shrink-0 ${child.status === "working" ? "animate-spin text-emerald-300" : "text-[#92929b]"}`} />
}

export function SubagentOverview({ children: agents, onOpen }: { children: WorkspaceSubagent[]; onOpen: (child: WorkspaceSubagent) => void }) {
  const [open, setOpen] = useState(true)
  const id = useId()
  const now = useSubagentClock(agents.some((child) => !child.endedAt))
  if (!agents.length) return null
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#151517] p-3">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium text-[#c8c8c8]">
        {open ? <ChevronDown className="size-3.5 text-[#92929b]" /> : <ChevronRight className="size-3.5 text-[#92929b]" />}
        Subagents <span className="ml-1 text-[#92929b]">{agents.length}</span>
      </button>
      {open ? <ul id={id} className="mt-2 space-y-1">
        {agents.map((child) => <li key={child.key}>
          <button type="button" onClick={() => onOpen(child)} aria-label={`Open Subagent ${child.index}: ${child.title}`} className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/[0.04]">
            <Laptop aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0 text-[#a1a1aa]" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
                <span className="shrink-0 font-medium text-[#d0d0d0]">Subagent {child.index}</span>
                <span className="min-w-0 flex-1 truncate text-[#aaa]" title={child.title}>{child.title}</span>
              </span>
              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#92929b]">
                <span className="min-w-0 truncate" title={child.model || "Inherited model"}>{child.model || "Inherited model"}</span>
                <span className="flex shrink-0 items-center gap-1.5 capitalize"><Status child={child} />{child.status} · {subagentElapsed(child, now)}</span>
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="mt-1 size-3 text-[#666]" />
          </button>
        </li>)}
      </ul> : null}
    </section>
  )
}

export function SubagentDetail({ child }: { child: WorkspaceSubagent | undefined }) {
  const now = useSubagentClock(Boolean(child && !child.endedAt))
  if (!child) return <p className="p-5 text-xs text-[#92929b]">This subagent is no longer in the retained timeline. Reopen a subagent from Overview.</p>
  return (
    <div className="h-full overflow-y-auto px-4 py-5 sm:px-5">
      <header className="border-b border-white/[0.08] pb-5">
        <div className="flex items-center gap-2 text-xs text-[#aaa]"><Laptop className="size-4" />Subagent {child.index}</div>
        <h2 className="mt-3 break-words text-[13px] font-medium text-[#ddd]">{child.title}</h2>
        <p className="mt-2 break-words text-xs text-[#a1a1aa]">{child.model || "Inherited model"}{child.provider ? ` · ${child.provider}` : ""}</p>
        <p className="mt-1 text-[11px] text-[#92929b]">{child.agent === "explore" ? "Shared workspace · read-only" : "Shared workspace"}</p>
        <p className="mt-3 flex items-center gap-1.5 text-xs capitalize text-[#aaa]"><Status child={child} />{child.status} · {subagentElapsed(child, now)}</p>
        {child.interrupted ? <p className="mt-2 text-xs leading-5 text-[#a1a1aa]">The parent run ended before a final subagent result was recorded.</p> : null}
      </header>
      <section className="py-5">
        <h3 className="mb-2 text-[11px] font-medium text-[#a1a1aa]">Parent task</h3>
        <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[#ccc]">{child.prompt || "No task prompt recorded."}</p>
      </section>
      <section className="border-t border-white/[0.08] pt-5">
        <h3 className="mb-4 text-[11px] font-medium text-[#a1a1aa]">Progress and reply</h3>
        {child.messages.length ? <ol className="space-y-5">{child.messages.map((message) => <li key={message.id}>
          <div className="mb-1.5 flex flex-wrap gap-x-2 text-[10px] text-[#92929b]"><span className="capitalize">{message.status === "done" ? "Final reply" : message.status}</span><time dateTime={message.timestamp}>{new Date(message.timestamp).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")}</time></div>
          <p className="whitespace-pre-wrap break-words text-xs leading-6 text-[#ccc]">{message.message}</p>
        </li>)}</ol> : <p className="text-xs text-[#92929b]">No progress messages recorded yet.</p>}
      </section>
    </div>
  )
}
