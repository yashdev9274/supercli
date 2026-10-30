"use client"

import { createContext, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { ChevronDown, Columns2, GitBranch, Plus, RotateCcw, X } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { listSessions } from "@/modules/nova-web/api"
import type { AgentSessionSummary } from "@/modules/nova-web/types"
import { closeSideThreadTab, mergeSideThreadTabs, saveSideThreadTab, type SideThreadTab } from "@/modules/nova-web/side-thread-state"
import { useVisiblePolling } from "@/modules/nova-web/use-visible-polling"

export const ConversationSplitContext = createContext(false)

function subscribe(callback: () => void) {
  const media = window.matchMedia("(min-width: 1024px)")
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

export function SideThreadGroup({ parentId, title, children, renderSideThread, onProjectLock }: {
  parentId: string
  title: string
  children: ReactNode
  renderSideThread: (sessionId: string | null, onCreated: (session: AgentSessionSummary) => void) => ReactNode
  onProjectLock: (locked: boolean) => void
}) {
  const [tabs, setTabs] = useState<SideThreadTab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [visited, setVisited] = useState<string[]>([])
  const [split, setSplit] = useState(false)
  const [ratio, setRatio] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia("(min-width: 1024px)").matches, () => false)
  const splitVisible = split && desktop && active !== null
  const closedTabs = tabs.filter((tab) => tab.closed)
  const refresh = useCallback(async () => {
    try {
      const result = await listSessions(parentId)
      setTabs((current) => mergeSideThreadTabs(current, result.sessions))
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load side threads")
    }
  }, [parentId])
  useVisiblePolling(refresh, 30_000, true)

  useEffect(() => {
    onProjectLock(tabs.length > 0)
    return () => onProjectLock(false)
  }, [onProjectLock, tabs.length])

  function select(key: string | null) {
    setActive(key)
    if (key) setVisited((current) => current.includes(key) ? current : [...current, key])
  }

  function add() {
    const existing = tabs.find((tab) => !tab.sessionId && !tab.closed)
    if (existing) { select(existing.key); return }
    const key = crypto.randomUUID()
    setTabs((current) => [...current, { key, sessionId: null, title: "New side thread", closed: false }])
    select(key)
  }

  return (
    <ConversationSplitContext.Provider value={splitVisible}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/[0.06] px-2">
          <div role="tablist" aria-label="Conversation threads" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            <button type="button" role="tab" aria-selected={active === null} aria-controls={`thread-${parentId}`} onClick={() => select(null)} title={title}
              className={cn("max-w-52 shrink-0 truncate rounded-md px-3 py-1.5 text-xs", active === null ? "bg-white/[0.07] text-white" : "text-[#888] hover:text-white")}>{title}</button>
            {tabs.filter((tab) => !tab.closed).map((tab) => (
              <div key={tab.key} className={cn("flex shrink-0 items-center rounded-md", active === tab.key && "bg-white/[0.07]")}>
                <button type="button" role="tab" aria-selected={active === tab.key} aria-controls={`thread-${tab.key}`} onClick={() => select(tab.key)} title={tab.title}
                  className="flex max-w-52 items-center gap-2 px-3 py-1.5 text-xs text-[#bbb]"><GitBranch className="size-3 shrink-0" /><span className="truncate">{tab.title}</span></button>
                <button type="button" aria-label={`Close ${tab.title}`} onClick={() => {
                  setTabs((current) => closeSideThreadTab(current, tab.key))
                  if (active === tab.key) select(null)
                }} className="mr-1 rounded p-1 text-[#777] hover:text-white"><X className="size-3" /></button>
              </div>
            ))}
          </div>
          <button type="button" aria-label="New side thread" title="New side thread" onClick={add} className="rounded p-1.5 text-[#999] hover:bg-white/[0.06] hover:text-white"><Plus className="size-4" /></button>
          {closedTabs.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Reopen closed side thread"
                  title="Reopen closed side thread"
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-[#999] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 data-[state=open]:bg-white/[0.06] data-[state=open]:text-white"
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">Reopen</span>
                  <ChevronDown aria-hidden="true" className="size-3 text-[#777]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-64 max-w-[calc(100vw-1rem)] rounded-lg border-white/10 bg-[#171717] p-1 text-[#bbb] shadow-xl"
              >
                <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-[#777]">Closed side threads</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/[0.06]" />
                {closedTabs.map((tab) => (
                  <DropdownMenuItem
                    key={tab.key}
                    textValue={tab.title}
                    title={tab.title}
                    onSelect={() => {
                      setTabs((current) => current.map((item) => item.key === tab.key ? { ...item, closed: false } : item))
                      select(tab.key)
                    }}
                    className="cursor-pointer rounded-md px-2 py-2 text-xs focus:bg-white/[0.07] focus:text-white"
                  >
                    <GitBranch aria-hidden="true" className="size-3.5 text-[#777]" />
                    <span className="min-w-0 truncate">{tab.title}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <button type="button" aria-label="Show conversations side by side" aria-pressed={split} disabled={!active} onClick={() => setSplit((value) => !value)}
            className={cn("hidden rounded p-1.5 text-[#999] hover:bg-white/[0.06] disabled:opacity-30 lg:block", split && "text-[#2dd4bf]")}><Columns2 className="size-4" /></button>
        </div>
        {error ? <button type="button" onClick={() => void refresh()} className="px-3 py-1 text-left text-xs text-amber-300">{error} · Retry</button> : null}
        <div ref={stageRef} className="relative flex min-h-0 flex-1 overflow-hidden">
          <div id={`thread-${parentId}`} role="tabpanel" hidden={active !== null && !splitVisible} style={{ width: splitVisible ? `${ratio}%` : "100%", flexShrink: 0 }} className="h-full min-w-0">{children}</div>
          <div role="separator" aria-label="Resize conversations" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={ratio} tabIndex={splitVisible ? 0 : -1} hidden={!splitVisible}
            className="z-10 w-1 shrink-0 touch-none cursor-col-resize bg-white/[0.06] hover:bg-white/20 focus-visible:bg-white/20"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault()
                setRatio((current) => Math.min(70, Math.max(30, current + (event.key === "ArrowRight" ? 2 : -2))))
              }
            }} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              const rect = stageRef.current?.getBoundingClientRect()
              if (rect) setRatio(Math.min(70, Math.max(30, ((event.clientX - rect.left) / rect.width) * 100)))
            }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)} />
          {tabs.filter((tab) => visited.includes(tab.key)).map((tab) => (
            <div key={tab.key} id={`thread-${tab.key}`} role="tabpanel" hidden={active !== tab.key} className="h-full min-w-0 flex-1">
              {renderSideThread(tab.sessionId, (session) => setTabs((current) => saveSideThreadTab(current, tab.key, session)))}
            </div>
          ))}
        </div>
      </div>
    </ConversationSplitContext.Provider>
  )
}
