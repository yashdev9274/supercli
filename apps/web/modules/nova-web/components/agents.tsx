"use client"

import { useEffect, useMemo, useState } from "react"
import { BotAvatar, botAvatarTypes, type BotAvatarType } from "bot-avatars"
import { Brain, Bot, Check, ChevronDown, Loader2, Plus, Search, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { createAgent, createSession, deleteAgent, deleteAgentMemory, getAgent, listAgents, listSessions, searchAgentMemory, updateAgent } from "@/modules/nova-web/api"
import { useCodexCatalog } from "@/modules/nova-web/codex-catalog"
import { CLOUD_MODELS, modelChipLabel, type HarnessProvider, type NovaModelEntry } from "@/modules/nova-web/models"
import { PROVIDER_INTEGRATION_BY_ID } from "@/modules/nova-web/provider-integrations"
import { useProviderConnectionStates } from "@/modules/nova-web/components/provider-connections"
import type { AgentSessionSummary, NovaAgent } from "@/modules/nova-web/types"

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
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "", provider: "supercode", model: CLOUD_MODELS[0]?.id ?? "", avatarType: "clover", avatarColor: "#3b93ed" })
  const [avatarType, setAvatarType] = useState<BotAvatarType>("clover")
  const [avatarColor, setAvatarColor] = useState("#3b93ed")
  const [memoryQuery, setMemoryQuery] = useState("")
  const [memoryMatches, setMemoryMatches] = useState<Array<{ id: string; content: string; metadata: Record<string, unknown>; similarity: number }>>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const codex = useCodexCatalog()
  const providerConnections = useProviderConnectionStates()
  const connectedModels = useMemo(() => getConnectedAgentModels(codex.models, codex.connected, providerConnections.states), [codex.connected, codex.models, providerConnections.states])

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
    if (!draft.name.trim() || (!draft.instructions.trim() && !draft.description.trim()) || busy) return
    setBusy(true)
    setError(null)
    try {
      const data = await createAgent({ ...draft, instructions: draft.instructions.trim() || draft.description.trim(), provider: draft.provider, model: draft.model, avatarType, avatarColor })
      setAgents((current) => [data.agent, ...current])
      setDraft({ name: "", description: "", instructions: "", provider: "supercode", model: CLOUD_MODELS[0]?.id ?? "", avatarType: "clover", avatarColor: "#3b93ed" })
      setAvatarType("clover")
      setAvatarColor("#3b93ed")
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
          {creating ? <div className="flex items-center gap-2"><button type="button" className="text-xs text-neutral-400 hover:text-white" onClick={() => onNavigate("/agents")}>Cancel</button><button type="button" className={button} disabled={busy || !draft.name.trim() || (!draft.instructions.trim() && !draft.description.trim())} onClick={() => void save()}>{busy ? <Loader2 className="size-3 animate-spin" /> : null}Create agent</button></div> : <button type="button" aria-label="Create agent" className="rounded p-1 text-neutral-500 hover:text-white" onClick={() => onNavigate("/agents/new")}><Plus className="size-3.5" /></button>}
        </div>
      </header>

      {error ? <div role="alert" className="m-3 flex items-center gap-3 rounded-md border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}<button type="button" className="ml-auto" aria-label="Dismiss error" onClick={() => setError(null)}><X className="size-3" /></button></div> : null}

      {creating ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#181818] px-4 pb-14 pt-8">
          <div className="mx-auto flex w-full max-w-[680px] flex-col items-center">
            <div className="relative flex size-32 items-center justify-center rounded-full bg-white/[0.025] before:absolute before:inset-2 before:rounded-full before:border before:border-white/[0.05]">
              <BotAvatar type={avatarType} color={avatarColor} state="default" size={112} seed={0.17} interactive={false} className="relative z-10" />
            </div>
            <div className="mt-4 flex max-w-full flex-wrap justify-center gap-2">
              {AGENT_COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color} avatar color`} aria-pressed={avatarColor === color} onClick={() => setAvatarColor(color)} className={cn("size-5 rounded-full border transition-transform hover:scale-110", avatarColor === color ? "border-white ring-2 ring-[#3b93ed]/60 ring-offset-2 ring-offset-[#181818]" : "border-transparent")} style={{ backgroundColor: color }} />)}
            </div>
            <div className="mt-4 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-white/[0.025] p-1">
              {botAvatarTypes.map((type) => <button key={type} type="button" aria-label={`Use ${type} avatar`} aria-pressed={avatarType === type} onClick={() => setAvatarType(type)} className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition", avatarType === type ? "bg-[#1f6fb7] ring-1 ring-[#50a9ff]" : "hover:bg-white/[0.07]")}><BotAvatar type={type} color={avatarColor} size={28} paused interactive={false} /></button>)}
            </div>
            <div className="mt-5 w-full space-y-4">
              <label className="block text-xs text-neutral-300">Name <span className="text-red-400">*</span><input aria-label="Agent name" autoFocus maxLength={120} className={cn(field, "mt-2 bg-[#202020]")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Trip Planner" /></label>
              <label className="block text-xs text-neutral-300">What should this agent help with?<textarea aria-label="Agent description" maxLength={500} className={cn(field, "mt-2 min-h-20 resize-y bg-[#202020]")} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Compare options and turn rough ideas into a practical plan." /></label>
              <AgentModelPicker models={connectedModels} provider={draft.provider as HarnessProvider} model={draft.model} onChange={(selection) => setDraft({ ...draft, provider: selection.provider, model: selection.model })} />
              <label className="block text-xs text-neutral-300">Instructions <span className="text-neutral-500">(optional if the description is enough)</span><textarea aria-label="Agent instructions" maxLength={20_000} className={cn(field, "mt-2 min-h-28 resize-y bg-[#202020]")} value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="Describe what this agent should do, how it should work, and what it should avoid." /></label>
            </div>
            <button type="button" className="mt-5 h-10 rounded-lg bg-white px-8 text-sm font-medium text-[#181818] transition hover:bg-[#d9eaff] disabled:cursor-not-allowed disabled:opacity-40" disabled={busy || !draft.name.trim() || (!draft.instructions.trim() && !draft.description.trim())} onClick={() => void save()}>{busy ? <Loader2 className="mr-2 inline size-3.5 animate-spin" /> : null}Create agent</button>
            <div className="mt-20 w-full"><p className="mb-3 text-xs text-neutral-500">Suggestions</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{AGENT_SUGGESTIONS.map((suggestion) => <button key={suggestion.name} type="button" onClick={() => setDraft({ ...draft, name: suggestion.name, description: suggestion.description, instructions: suggestion.instructions })} className="group flex min-h-24 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition hover:border-[#3b93ed]/70 hover:bg-[#17304a]"><BotAvatar type={suggestion.type} color={suggestion.color} size={42} paused interactive={false} /><span className="min-w-0"><span className="block text-sm text-neutral-200 group-hover:text-white">{suggestion.name}</span><span className="mt-1 block text-xs leading-4 text-neutral-500">{suggestion.description}</span></span></button>)}</div></div>
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
  return <button type="button" onClick={onOpen} className="group rounded-xl border border-white/[0.09] bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#17304a]"><BotAvatar type={(agent.avatarType as BotAvatarType) || avatarForAgent(agent)} color={agent.avatarColor || colorForAgent(agent)} size={34} state="default" seed={agent.id.length / 10} interactive={false} /></span><div className="min-w-0 flex-1"><p className="truncate font-medium text-neutral-200 group-hover:text-white">{agent.name}</p><p className="mt-1 text-[11px] text-emerald-300">{agent.status === "active" ? "Ready" : agent.status}</p></div></div>{agent.description ? <p className="mt-4 line-clamp-2 text-xs leading-5 text-neutral-500">{agent.description}</p> : null}<p className="mt-3 truncate text-[11px] text-neutral-600">{modelChipLabel(agent.provider, agent.model)}</p></button>
}


const AGENT_COLORS = ["#3b93ed", "#ef4444", "#f59e0b", "#facc15", "#84cc16", "#34d399", "#2dd4bf", "#38bdf8", "#6366f1", "#8b5cf6", "#d946ef", "#fb7185", "#9f1239", "#a16207", "#d6b98c", "#a3a3a3"]

const AGENT_SUGGESTIONS: Array<{ name: string; description: string; instructions: string; type: BotAvatarType; color: string }> = [
  { name: "Inbox Helper", description: "Drafts replies and keeps follow-ups from slipping.", instructions: "Triage messages, draft concise replies, and call out anything that needs my decision.", type: "square", color: "#ec4899" },
  { name: "Trip Planner", description: "Compares options and builds practical itineraries.", instructions: "Compare travel options, surface trade-offs, and turn rough ideas into a day-by-day itinerary.", type: "clover", color: "#3b93ed" },
  { name: "Personal Organizer", description: "Turns notes, errands, and tasks into a simple plan.", instructions: "Organize notes and errands into a prioritized plan with clear next actions.", type: "star", color: "#facc15" },
  { name: "Shopping Scout", description: "Compares products, prices, and reviews before I buy.", instructions: "Compare products by price, quality, reviews, and fit for my requirements.", type: "blob", color: "#34d399" },
  { name: "Writing Partner", description: "Drafts messages and documents in a natural voice.", instructions: "Help draft clear, natural writing while preserving my intent and tone.", type: "circle", color: "#f59e0b" },
]

function avatarForAgent(agent: Pick<NovaAgent, "id" | "name">): BotAvatarType {
  return botAvatarTypes[agent.name.length % botAvatarTypes.length] ?? "clover"
}

function colorForAgent(agent: Pick<NovaAgent, "id" | "name">) {
  return AGENT_COLORS[agent.id.length % AGENT_COLORS.length] ?? AGENT_COLORS[0]
}

function getConnectedAgentModels(codexModels: Array<{ id: string; label: string }>, codexConnected: boolean, states: Record<string, { connected?: boolean; enabled?: boolean; models?: Array<{ id: string; label: string; description?: string }> } | undefined>) {
  const models: NovaModelEntry[] = CLOUD_MODELS.map((entry) => entry)
  if (codexConnected) models.push(...codexModels.map((entry) => ({ id: entry.id, provider: "codex" as HarnessProvider, label: entry.label, desc: "Your OpenAI Codex subscription" })))
  for (const [provider, state] of Object.entries(states)) {
    if (!state?.connected || state.enabled === false) continue
    for (const model of state.models ?? []) models.push({ id: model.id, provider: provider as HarnessProvider, label: model.label, desc: model.description ?? `Connected ${provider} plan` })
  }
  return models
}

function AgentModelPicker({ models, provider, model, onChange }: { models: NovaModelEntry[]; provider: HarnessProvider; model: string; onChange: (selection: { provider: HarnessProvider; model: string }) => void }) {
  const [open, setOpen] = useState(false)
  const selected = models.find((entry) => entry.provider === provider && entry.id === model) ?? models[0]
  const grouped = useMemo(() => models.reduce<Record<string, NovaModelEntry[]>>((groups, entry) => { (groups[entry.provider] ||= []).push(entry); return groups }, {}), [models])
  return <div className="relative"><span className="mb-2 block text-xs text-neutral-300">Model</span><button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex h-11 w-full items-center gap-3 rounded-lg border border-white/10 bg-[#202020] px-3 text-left transition hover:border-white/20"><span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.08] font-mono text-[9px] font-semibold uppercase tracking-[-0.04em] text-neutral-200">{selected?.provider.slice(0, 2).toUpperCase() ?? "AI"}</span><span className="min-w-0 flex-1 truncate text-sm text-neutral-200">{selected ? modelChipLabel(selected.provider, selected.id) : "Connect a provider in Settings → Models"}</span><ChevronDown className={cn("size-4 text-neutral-500 transition-transform", open && "rotate-180")} /></button>{open ? <div role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#242424] p-1 shadow-2xl">{Object.entries(grouped).map(([providerId, entries]) => <div key={providerId}><p className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-neutral-500">{PROVIDER_INTEGRATION_BY_ID[providerId]?.label ?? providerId}</p>{entries.map((entry) => <button key={`${entry.provider}:${entry.id}`} type="button" role="option" aria-selected={entry.provider === provider && entry.id === model} onClick={() => { onChange({ provider: entry.provider, model: entry.id }); setOpen(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-neutral-200 hover:bg-white/[0.08]"><span className="min-w-0 flex-1 truncate">{entry.label}<span className="ml-2 text-neutral-500">{entry.desc}</span></span>{entry.provider === provider && entry.id === model ? <Check className="size-3.5 text-[#50a9ff]" /> : null}</button>)}</div>)}{!models.length ? <p className="px-3 py-4 text-center text-xs text-neutral-500">Connect Codex, Claude, Cursor, OpenCode, Ollama, or Supercode Cloud to choose it here.</p> : null}</div> : null}</div>
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
