"use client"

import { useEffect, useMemo, useState } from "react"
import { Brain, Bot, Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { createAgent, createSession, deleteAgent, deleteAgentMemory, getAgent, listAgents, listSessions, searchAgentMemory, updateAgent } from "@/modules/nova-web/api"
import type { AgentSessionSummary } from "@/modules/nova-web/types"
import type { NovaAgent } from "@/modules/nova-web/types"

const button = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-3 text-xs text-neutral-300 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
const field = "w-full rounded-lg border border-white/10 bg-white/[0.025] px-3.5 py-3 text-[13px] leading-[1.3] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-500"

export function AgentsView({ path, onNavigate }: { path: string; onNavigate: (href: string) => void }) {
  const routeParts = path.replace("/nova-app-internal", "").split("/").filter(Boolean)
  const segment = routeParts[1] ?? null
  const creating = segment === "new"
  const selectedAgentId = segment && !creating ? segment : null
  const memoryRoute = routeParts[2] === "memory"
  const [agents, setAgents] = useState<NovaAgent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<NovaAgent | null>(null)
  const [chats, setChats] = useState<AgentSessionSummary[]>([])
  const [query, setQuery] = useState("")
  const [task, setTask] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "" })
  const [memoryQuery, setMemoryQuery] = useState("")
  const [memoryMatches, setMemoryMatches] = useState<Array<{ id: string; content: string; metadata: Record<string, unknown>; similarity: number }>>([])
  const [memoryLoading, setMemoryLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void Promise.all([
      listAgents(),
      selectedAgentId ? getAgent(selectedAgentId) : Promise.resolve(null),
      selectedAgentId ? listSessions(undefined, selectedAgentId) : Promise.resolve({ sessions: [] }),
    ])
      .then(([agentData, detail, chatData]) => {
        if (controller.signal.aborted) return
        setAgents(agentData.agents)
        setSelectedAgent(detail?.agent ?? null)
        setChats(chatData.sessions)
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load agents") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selectedAgentId])

  useEffect(() => {
    if (!selectedAgentId || !memoryRoute || !memoryQuery.trim()) {
      setMemoryMatches([])
      return
    }
    const controller = new AbortController()
    setMemoryLoading(true)
    void searchAgentMemory(selectedAgentId, memoryQuery)
      .then((data) => { if (!controller.signal.aborted) setMemoryMatches(data.memories) })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not search memory") })
      .finally(() => { if (!controller.signal.aborted) setMemoryLoading(false) })
    return () => controller.abort()
  }, [memoryQuery, memoryRoute, selectedAgentId])

  async function save() {
    if (!draft.name.trim() || !draft.instructions.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await createAgent(draft)
      setAgents((current) => [data.agent, ...current])
      setDraft({ name: "", description: "", instructions: "" })
      onNavigate(`/agents/${data.agent.id}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create agent")
    } finally {
      setBusy(false)
    }
  }

  async function startTask() {
    if (!selectedAgent || !task.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await createSession(task.trim(), { agentId: selectedAgent.id, mode: "agent" })
      onNavigate(`/s/${data.session.id}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not start agent task")
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
        <button type="button" onClick={() => onNavigate("/agents")} className={cn("text-xs hover:text-white", creating || selectedAgentId ? "text-neutral-500" : "text-neutral-200")}>Agents</button>
        {creating ? <><span className="text-neutral-600">/</span><span className="text-xs">New agent</span></> : selectedAgent ? <><span className="text-neutral-600">/</span><span className="truncate text-xs">{selectedAgent.name}</span></> : null}
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
      ) : selectedAgent && memoryRoute ? (
        <AgentMemoryView agent={selectedAgent} query={memoryQuery} matches={memoryMatches} loading={memoryLoading} onQueryChange={setMemoryQuery} onBack={() => onNavigate(`/agents/${selectedAgent.id}`)} onDelete={async (id) => { await deleteAgentMemory(selectedAgent.id, id); setMemoryMatches((current) => current.filter((item) => item.id !== id)) }} />
      ) : selectedAgent ? (
        <AgentDetail agent={selectedAgent} chats={chats} task={task} busy={busy} onTaskChange={setTask} onStartTask={() => void startTask()} onOpenChat={(id) => onNavigate(`/s/${id}`)} onOpenMemory={() => onNavigate(`/agents/${selectedAgent.id}/memory`)} onAgentChange={setSelectedAgent} onDeleted={() => onNavigate("/agents")} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5">
          <div className="mx-auto max-w-[820px]">
            <div className="flex items-center justify-between gap-3"><div><h1 className="text-xl font-medium tracking-[-0.025em]">Agents</h1><p className="mt-1 text-sm text-neutral-500">Private coding agents owned by your Nova account.</p></div><button type="button" className={button} onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" />New agent</button></div>
            <div className="mt-6 flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-neutral-500"><Search className="size-3.5" /><input aria-label="Search agents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents" className="min-w-0 flex-1 bg-transparent text-xs text-neutral-200 outline-none placeholder:text-neutral-600" /></div>
            {loading ? <div className="flex h-48 items-center justify-center gap-2 text-neutral-500"><Loader2 className="size-3.5 animate-spin" />Loading agents…</div> : filtered.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">{filtered.map((agent) => <AgentCard key={agent.id} agent={agent} onOpen={() => onNavigate(`/agents/${agent.id}`)} />)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center"><Bot className="mx-auto size-6 text-neutral-600" /><p className="mt-3 text-sm text-neutral-300">{query ? "No agents match your search" : "Create your first agent"}</p><p className="mt-1 text-xs text-neutral-600">Each agent has its own instructions and task history.</p>{!query ? <button type="button" className={cn(button, "mt-5")} onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" />New agent</button> : null}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function AgentDetail({ agent, chats, task, busy, onTaskChange, onStartTask, onOpenChat, onOpenMemory, onAgentChange, onDeleted }: { agent: NovaAgent; chats: AgentSessionSummary[]; task: string; busy: boolean; onTaskChange: (value: string) => void; onStartTask: () => void; onOpenChat: (id: string) => void; onOpenMemory: () => void; onAgentChange: (agent: NovaAgent) => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ name: agent.name, description: agent.description, instructions: agent.instructions })
  const [showDelete, setShowDelete] = useState(false)
  const saveAgent = async () => { setSaving(true); try { const result = await updateAgent(agent.id, draft); onAgentChange(result.agent); setEditing(false) } finally { setSaving(false) } }
  const archiveAgent = async () => { setSaving(true); try { const result = await updateAgent(agent.id, { status: "archived" }); onAgentChange(result.agent) } finally { setSaving(false) } }
  const removeAgent = async () => { setSaving(true); try { await deleteAgent(agent.id); onDeleted() } finally { setSaving(false) } }
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-7"><div className="mx-auto max-w-[820px]"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-neutral-300"><Bot className="size-5" /></span><div><h1 className="text-xl font-medium tracking-[-0.025em]">{agent.name}</h1><p className="mt-1 text-sm text-neutral-500">{agent.description || "Private Nova coding agent"}</p></div></div><div className="mt-4 flex gap-2"><button type="button" className={button} onClick={() => setEditing((value) => !value)}>{editing ? "Cancel" : "Edit agent"}</button><button type="button" className={cn(button, "text-amber-300")} disabled={saving} onClick={() => void archiveAgent()}>Archive</button><button type="button" className={cn(button, "text-red-300")} disabled={saving} onClick={() => setShowDelete(true)}>Delete</button></div>{editing ? <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"><input aria-label="Edit agent name" className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><input aria-label="Edit agent description" className={field} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /><textarea aria-label="Edit agent instructions" className={cn(field, "min-h-32 resize-y")} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /><button type="button" className={button} disabled={saving || !draft.name.trim() || !draft.instructions.trim()} onClick={() => void saveAgent()}>{saving ? <Loader2 className="size-3 animate-spin" /> : null}Save changes</button></div> : null}{showDelete ? <div className="mt-3 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200">Delete this agent permanently? <button type="button" className="ml-2 underline" disabled={saving} onClick={() => void removeAgent()}>Delete permanently</button><button type="button" className="ml-3 text-neutral-400" onClick={() => setShowDelete(false)}>Cancel</button></div> : null}<div className="mt-7 rounded-xl border border-white/10 bg-white/[0.025] p-4"><p className="text-xs font-medium text-neutral-300">Start a task</p><textarea aria-label="Agent task" value={task} onChange={(event) => onTaskChange(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onStartTask() }} className={cn(field, "mt-3 min-h-24 resize-y")} placeholder={`Ask ${agent.name} to work on something…`} /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-neutral-600">Ctrl/⌘ + Enter to start</span><button type="button" className={button} disabled={busy || !task.trim()} onClick={onStartTask}>{busy ? <Loader2 className="size-3 animate-spin" /> : null}Start task</button></div></div><button type="button" className={cn(button, "mt-3")} onClick={onOpenMemory}><Brain className="size-3.5" />Manage memory</button><div className="mt-8"><div className="flex items-center justify-between"><h2 className="text-sm font-medium text-neutral-300">Agent chats</h2><span className="text-xs text-neutral-600">{chats.length}</span></div>{chats.length ? <div className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/10">{chats.map((chat) => <button type="button" key={chat.id} onClick={() => onOpenChat(chat.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.035]"><span className="size-1.5 shrink-0 rounded-full bg-sky-400" /><span className="min-w-0 flex-1 truncate text-xs text-neutral-300">{chat.objective}</span><span className="shrink-0 text-[11px] text-neutral-600">{chat.status}</span></button>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-neutral-600">No chats yet. Start the first task above.</p>}</div></div></div>
}

function AgentCard({ agent, onOpen }: { agent: NovaAgent; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className="group rounded-xl border border-white/[0.09] bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"><div className="flex items-start gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-neutral-300"><Bot className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium text-neutral-200 group-hover:text-white">{agent.name}</p><p className="mt-1 text-[11px] text-emerald-300">{agent.status === "active" ? "Ready" : agent.status}</p></div></div>{agent.description ? <p className="mt-4 line-clamp-2 text-xs leading-5 text-neutral-500">{agent.description}</p> : null}</button>
}


function AgentMemoryView({ agent, query, matches, loading, onQueryChange, onBack, onDelete }: {
  agent: NovaAgent
  query: string
  matches: Array<{ id: string; content: string; metadata: Record<string, unknown>; similarity: number }>
  loading: boolean
  onQueryChange: (value: string) => void
  onBack: () => void
  onDelete: (id: string) => Promise<void>
}) {
  const [deleting, setDeleting] = useState<string | null>(null)
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-7"><div className="mx-auto max-w-[820px]"><div className="flex items-center gap-3"><button type="button" className="text-xs text-neutral-500 hover:text-white" onClick={onBack}>← {agent.name}</button><span className="text-neutral-700">/</span><span className="text-xs text-neutral-300">Memory</span></div><div className="mt-7 flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-neutral-300"><Brain className="size-5" /></span><div><h1 className="text-xl font-medium tracking-[-0.025em]">Agent memory</h1><p className="mt-1 text-sm text-neutral-500">Search and remove durable context stored for {agent.name}.</p></div></div><div className="mt-7 flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-neutral-500"><Search className="size-3.5" /><input aria-label="Search agent memory" autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search remembered context" className="min-w-0 flex-1 bg-transparent text-xs text-neutral-200 outline-none placeholder:text-neutral-600" /></div>{!query.trim() ? <div className="mt-4 rounded-xl border border-dashed border-white/10 px-6 py-14 text-center text-xs text-neutral-600">Enter a search to inspect this agent memory.</div> : loading ? <div className="flex h-40 items-center justify-center gap-2 text-xs text-neutral-500"><Loader2 className="size-3.5 animate-spin" />Searching memory…</div> : matches.length ? <div className="mt-4 space-y-2">{matches.map((match) => <div key={match.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4"><div className="flex items-start gap-3"><p className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-5 text-neutral-300">{match.content}</p><button type="button" aria-label="Delete memory" className="shrink-0 rounded p-1 text-neutral-600 hover:text-red-300 disabled:opacity-40" disabled={deleting === match.id} onClick={() => { setDeleting(match.id); void onDelete(match.id).finally(() => setDeleting(null)) }}><Trash2 className="size-3.5" /></button></div><div className="mt-3 text-[10px] uppercase tracking-[0.12em] text-neutral-600">{typeof match.metadata.memoryType === "string" ? match.metadata.memoryType : "memory"} · relevance {Math.round(match.similarity * 100)}%</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 px-6 py-14 text-center text-xs text-neutral-600">No matching memories.</div>}</div></div>
}
