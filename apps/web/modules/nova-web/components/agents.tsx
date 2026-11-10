"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, Loader2, Plus, Search, Sparkles, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { createAgent, listAgents } from "@/modules/nova-web/api"
import type { NovaAgent } from "@/modules/nova-web/types"

const button = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-3 text-xs text-neutral-300 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
const field = "w-full rounded-lg border border-white/10 bg-white/[0.025] px-3.5 py-3 text-[13px] leading-[1.3] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-500"

export function AgentsView({ path, onNavigate }: { path: string; onNavigate: (href: string) => void }) {
  const creating = path.replace("/nova-app-internal", "").split("/")[2] === "new"
  const [agents, setAgents] = useState<NovaAgent[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "" })

  useEffect(() => {
    const controller = new AbortController()
    void listAgents()
      .then((data) => { if (!controller.signal.aborted) setAgents(data.agents) })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load agents") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function save() {
    if (!draft.name.trim() || !draft.instructions.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await createAgent(draft)
      setAgents((current) => [data.agent, ...current])
      setDraft({ name: "", description: "", instructions: "" })
      onNavigate("/agents")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create agent")
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return agents
    return agents.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(normalized))
  }, [agents, query])

  return (
    <div data-slot="agents" className="flex h-full min-h-0 flex-col bg-[#121212] text-[13px] text-neutral-200">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4">
        <button type="button" onClick={() => onNavigate("/agents")} className={cn("text-xs hover:text-white", creating ? "text-neutral-500" : "text-neutral-200")}>Agents</button>
        {creating ? <><span className="text-neutral-600">/</span><span className="text-xs">New agent</span></> : null}
        <div className="ml-auto">
          {creating ? <div className="flex items-center gap-2"><button type="button" className="text-xs text-neutral-400 hover:text-white" onClick={() => onNavigate("/agents")}>Cancel</button><button type="button" className={button} disabled={busy || !draft.name.trim() || !draft.instructions.trim()} onClick={() => void save()}>{busy ? <Loader2 className="size-3 animate-spin" /> : null}Create agent</button></div> : <button type="button" aria-label="Create agent" className="rounded p-1 text-neutral-500 hover:text-white" onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" /></button>}
        </div>
      </header>

      {error ? <div role="alert" className="m-3 flex items-center gap-3 rounded-md border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}<button type="button" className="ml-auto" aria-label="Dismiss error" onClick={() => setError(null)}><X className="size-3" /></button></div> : null}

      {creating ? (
        <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-8">
          <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-neutral-300"><Sparkles className="size-4" /></span><div><h1 className="text-xl font-medium tracking-[-0.025em]">Create an agent</h1><p className="mt-1 text-sm text-neutral-500">Give this private agent a clear role and instructions.</p></div></div>
          <div className="mt-8 space-y-5">
            <label className="block text-xs text-neutral-400">Name<input aria-label="Agent name" autoFocus maxLength={120} className={cn(field, "mt-2")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Frontend Engineer" /></label>
            <label className="block text-xs text-neutral-400">Description <span className="text-neutral-600">(optional)</span><input aria-label="Agent description" maxLength={500} className={cn(field, "mt-2")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Builds and maintains the Nova web app" /></label>
            <label className="block text-xs text-neutral-400">Instructions<textarea aria-label="Agent instructions" maxLength={20_000} className={cn(field, "mt-2 min-h-40 resize-y")} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Describe what this agent should do, how it should work, and what it should avoid." /></label>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5">
          <div className="mx-auto max-w-[820px]">
            <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-medium tracking-[-0.025em]">Agents</h1><p className="mt-1 text-sm text-neutral-500">Private coding agents owned by your Nova account.</p></div><button type="button" className={button} onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" />New agent</button></div>
            <div className="mt-6 flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-neutral-500"><Search className="size-3.5" /><input aria-label="Search agents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents" className="min-w-0 flex-1 bg-transparent text-xs text-neutral-200 outline-none placeholder:text-neutral-600" /></div>
            {loading ? <div className="flex h-48 items-center justify-center gap-2 text-neutral-500"><Loader2 className="size-3.5 animate-spin" />Loading agents…</div> : filtered.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{filtered.map((agent) => <AgentCard key={agent.id} agent={agent} onOpen={() => onNavigate(`/agents/${agent.id}`)} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center"><Bot className="mx-auto size-6 text-neutral-600" /><p className="mt-3 text-sm text-neutral-300">{query ? "No agents match your search" : "Create your first agent"}</p><p className="mt-1 text-xs text-neutral-600">Each agent has its own instructions and future task history.</p>{!query ? <button type="button" className={cn(button, "mt-5")} onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" />New agent</button> : null}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent, onOpen }: { agent: NovaAgent; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="group rounded-xl border border-white/[0.09] bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-neutral-300"><Bot className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium text-neutral-200 group-hover:text-white">{agent.name}</p><p className="mt-1 text-[11px] text-emerald-300">{agent.status === "active" ? "Ready" : agent.status}</p></div></div>{agent.description ? <p className="mt-4 line-clamp-2 text-xs leading-5 text-neutral-500">{agent.description}</p> : null}</button>
}
