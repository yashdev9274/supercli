"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { ChevronRight, Clock3, Github, Globe, Inbox, Loader2, Pause, Play, Plus, Search, SlidersHorizontal, Trash2, X, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { ALL_MODELS } from "@/modules/nova-web/models"
import {
  automationInputSchema, defaultTrigger, TRIGGER_LABELS,
  type AutomationContext, type AutomationDto, type AutomationInput, type AutomationTrigger, type TriggerType,
} from "@/modules/nova/automations/contracts"
import { AUTOMATION_TEMPLATES, templateDraft } from "@/modules/nova/automations/templates"

const button = "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
const field = "w-full rounded-lg border border-white/10 bg-white/[0.025] px-3.5 py-3 text-[13px] leading-[1.3] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-60"
const chip = "h-6 max-w-full rounded-md border-0 bg-white/[0.08] px-2 text-xs text-neutral-200 outline-none focus-visible:ring-1 focus-visible:ring-neutral-400"

async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/nova/automations${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, cache: "no-store" })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? "Could not load automations")
  return data as T
}

type AutomationApp = { slug: string; name: string; logo: string | null; connected: boolean }

function ProviderIcon({ provider, apps }: { provider: string; apps: AutomationApp[] }) {
  const logo = apps.find((app) => app.slug === provider.toLowerCase())?.logo
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  if (logo && logo !== failedLogo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={14} height={14} className="size-3.5 shrink-0 object-contain" onError={() => setFailedLogo(logo)} />
  }
  if (provider === "Schedule") return <Clock3 className="size-3.5" />
  if (provider === "Webhook") return <Globe className="size-3.5" />
  return <span aria-hidden="true" className="text-[10px] font-semibold text-neutral-400">{provider[0]}</span>
}

function providerFor(type: TriggerType): string {
  return type.startsWith("slack") ? "Slack" : type.startsWith("github") ? "GitHub" : type.startsWith("linear") ? "Linear" : type === "schedule" ? "Schedule" : "Webhook"
}

export function AutomationsView({ path, onNavigate }: { path: string; onNavigate: (href: string) => void }) {
  const clean = path.replace("/nova-app-internal", "")
  const segment = clean.split("/")[2]
  const creating = segment === "new"
  const id = segment && !creating ? segment : null
  const templateId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("template")
  const [context, setContext] = useState<AutomationContext | null>(null)
  const [automations, setAutomations] = useState<AutomationDto[]>([])
  const [selected, setSelected] = useState<AutomationDto | null>(null)
  const [draft, setDraft] = useState<AutomationInput | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState("mine")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addingTrigger, setAddingTrigger] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testText, setTestText] = useState("")
  const [credential, setCredential] = useState<{ token: string; path: string } | null>(null)
  const [apps, setApps] = useState<AutomationApp[]>([])
  const [appsLoaded, setAppsLoaded] = useState(false)
  const [appsError, setAppsError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const loadApps = async () => {
      try {
        const response = await fetch("/api/nova/composio/apps", { signal: controller.signal, cache: "no-store" })
        if (!response.ok) throw new Error("Could not load Composio apps")
        const payload = await response.json() as { apps: AutomationApp[] }
        if (controller.signal.aborted) return
        setApps(payload.apps)
        setAppsLoaded(true)
        setAppsError(false)
      } catch {
        if (!controller.signal.aborted) setAppsError(true)
      }
    }
    void loadApps()
    window.addEventListener("focus", loadApps)
    return () => { controller.abort(); window.removeEventListener("focus", loadApps) }
  }, [])

  const refresh = useCallback(async (signal?: AbortSignal, reset = false) => {
    const data = await request<{ automations: AutomationDto[]; context: AutomationContext }>("", "GET", undefined, signal)
    const detail = id ? (await request<{ automation: AutomationDto }>(`/${id}`, "GET", undefined, signal)).automation : null
    setContext(data.context)
    setAutomations(data.automations)
    setSelected(detail)
    if (reset) setDraft(detail ?? (creating ? templateDraft(templateId, data.context.membershipId) : null))
  }, [creating, id, templateId])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal, true).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load automations")
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const timer = window.setInterval(() => { void refresh(controller.signal).catch(() => undefined) }, 8_000)
    return () => { window.clearInterval(timer); controller.abort() }
  }, [id, refresh])

  async function action(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try { await work() } catch (failure) { setError(failure instanceof Error ? failure.message : "Request failed") } finally { setBusy(false) }
  }

  function update<K extends keyof AutomationInput>(key: K, value: AutomationInput[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }

  function save() {
    if (!draft) return
    const parsed = automationInputSchema.safeParse(draft)
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the form"); return }
    void action(async () => {
      const data = await request<{ automation: AutomationDto }>(id ? `/${id}` : "", id ? "PUT" : "POST", parsed.data)
      if (!id) onNavigate(`/automations/${data.automation.id}`)
      else { setSelected(data.automation); setDraft(data.automation); setNotice("Automation saved") }
    })
  }

  const requiredProviders = draft
    ? [...new Set([...draft.triggers.map((trigger) => providerFor(trigger.type)), ...(draft.repositoryIds.length ? ["GitHub"] : [])])].filter((provider) => ["Slack", "GitHub", "Linear"].includes(provider))
    : segment ? [] : ["Slack", "GitHub", "Linear"]
  const missingApps = appsLoaded && !appsError
    ? requiredProviders.filter((provider) => !apps.some((app) => app.slug === provider.toLowerCase() && app.connected))
    : []
  const editable = creating || Boolean(selected?.canManage)
  const filtered = automations.filter((item) => (tab !== "mine" || item.creatorMembershipId === context?.membershipId) && (tab !== "scheduled" || item.triggers.some((trigger) => trigger.type === "schedule")) && (statusFilter === "all" || item.status === statusFilter) && `${item.name} ${item.instructions}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div data-slot="automations" className="flex h-full min-h-0 flex-col bg-[#121212] text-[13px] text-neutral-200">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4">
        <button type="button" onClick={() => onNavigate("/automations")} className={cn("text-xs hover:text-white", segment ? "text-neutral-500" : "text-neutral-200")}>Automations</button>
        {segment ? <><ChevronRight className="size-3 text-neutral-600" /><span className="text-xs">{creating ? "New automation" : selected?.name ?? "Automation"}</span></> : null}
        <div className="ml-auto flex items-center gap-3">
          {segment ? <><button type="button" className="text-xs text-neutral-400 hover:text-white" onClick={() => onNavigate("/automations")}>Cancel</button><button type="button" className={button} disabled={busy || !draft || !editable} onClick={save}>{busy ? <Loader2 className="size-3 animate-spin" /> : null}{creating ? "Create automation" : "Save changes"}</button></> : <button type="button" aria-label="Create automation" className="rounded p-1 text-neutral-500 hover:text-white focus-visible:outline-2" onClick={() => onNavigate("/automations/new")}><Plus className="size-3.5" /></button>}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {appsError || missingApps.length > 0 ? (
          <div role="alert" className="m-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-xs text-amber-200">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{appsError ? "Could not verify your Composio connections" : "Connect your apps first"}</p>
              <p className="mt-1 text-amber-200/70">{appsError ? "Open Connections to check your apps before running this automation." : `Connect ${missingApps.join(", ")} through Composio in Connections ${draft ? "before running this automation" : "to use their automation templates"}.`}</p>
            </div>
            <button type="button" className={cn(button, "border-amber-400/20 text-amber-200")} onClick={() => onNavigate("/connections")}>Connect apps <ChevronRight className="size-3" /></button>
          </div>
        ) : null}
        {error ? <div role="alert" className="m-3 flex items-center gap-3 rounded-md border border-red-400/20 bg-red-400/5 px-3 py-2 text-xs text-red-300">{error}<button type="button" className="ml-auto" aria-label="Dismiss error" onClick={() => setError(null)}><X className="size-3" /></button></div> : null}
        {notice ? <p role="status" className="m-3 rounded-md border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-300">{notice}</p> : null}
        {loading ? <div className="flex h-48 items-center justify-center gap-2 text-neutral-500"><Loader2 className="size-3.5 animate-spin" />Loading automations…</div> : segment && draft && context ? (
          <div className="mx-auto max-w-[752px] px-4 pb-16 pt-7">
            <input aria-label="Automation name" disabled={!editable} value={draft.name} onChange={(event) => update("name", event.target.value)} className="w-full bg-transparent text-[22px] font-medium tracking-[-0.025em] outline-none focus-visible:ring-1 focus-visible:ring-neutral-500" maxLength={160} />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
              <span className="flex items-center gap-1.5"><Inbox className="size-3" />{context.organizationName}</span><span className="h-3 border-l border-white/10" />
              <select aria-label="Run-as account" disabled={!editable} className="max-w-full bg-transparent outline-none" value={draft.runAsMembershipId} onChange={(event) => update("runAsMembershipId", event.target.value)}>
                {context.members.map((member) => <option className="bg-neutral-900" key={member.id} value={member.id}>{member.name}</option>)}
                {!context.members.some((member) => member.id === draft.runAsMembershipId) ? <option value={draft.runAsMembershipId}>{selected?.runAsName}</option> : null}
              </select>
            </div>
            <div className="mb-14 mt-7 flex items-center justify-between gap-4">
              <div><p>Post as run-as person</p><p className="mt-1 text-xs text-neutral-500">Delegated Slack posting is not supported yet. Results stay in Nova.</p></div>
              <button type="button" role="switch" aria-checked={false} aria-label="Post as run-as person is not yet available" disabled className="h-4 w-7 shrink-0 rounded-full border border-white/15 bg-white/10"><span className="ml-0.5 block size-3 rounded-full bg-neutral-100" /></button>
            </div>
            <Section title="Triggers" description="Runs when any of these conditions are met" action={editable ? <button type="button" className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white" onClick={() => setAddingTrigger((value) => !value)}><Plus className="size-3" />Add trigger</button> : undefined}>
              {addingTrigger ? <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-white/10 p-3">{(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((type) => <button key={type} type="button" className={button} disabled={draft.triggers.length >= 10} onClick={() => { update("triggers", [...draft.triggers, defaultTrigger(type)]); setAddingTrigger(false) }}>{providerFor(type)} · {TRIGGER_LABELS[type]}</button>)}</div> : null}
              <div className="space-y-2">{draft.triggers.map((trigger, index) => <TriggerEditor key={index} trigger={trigger} context={context} apps={apps} disabled={!editable} onChange={(next) => update("triggers", draft.triggers.map((item, position) => position === index ? next : item))} onRemove={() => update("triggers", draft.triggers.filter((_, position) => position !== index))} />)}</div>
            </Section>
            <Section title="Instructions" description="What Nova does when the automation triggers, trigger context is added automatically">
              <div className="rounded-lg border border-white/10 bg-white/[0.025]">
                <textarea aria-label="Instructions" disabled={!editable} className="min-h-28 w-full resize-y bg-transparent px-4 pt-3 text-[13px] leading-[1.25] outline-none focus-visible:ring-1 focus-visible:ring-neutral-500" value={draft.instructions} onChange={(event) => update("instructions", event.target.value)} maxLength={20_000} />
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-neutral-400">
                  <Zap className="size-3" /><select aria-label="Model" disabled={!editable} className="max-w-[260px] bg-transparent outline-none" value={`${draft.provider}:${draft.model}`} onChange={(event) => { const selection = ALL_MODELS.find((model) => `${model.provider}:${model.id}` === event.target.value); if (selection) setDraft({ ...draft, model: selection.id, provider: selection.provider }) }}>{ALL_MODELS.map((model) => <option className="bg-neutral-900" key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`}>{model.label} · {model.provider}</option>)}</select>
                  <select aria-label="Effort" disabled={!editable} className="bg-transparent capitalize outline-none" value={draft.effort} onChange={(event) => update("effort", event.target.value as AutomationInput["effort"])}>{["low", "medium", "high", "xhigh"].map((effort) => <option className="bg-neutral-900" key={effort} value={effort}>{effort === "xhigh" ? "Extra high" : effort[0].toUpperCase() + effort.slice(1)}</option>)}</select>
                </div>
              </div>
            </Section>
            <Section title="Only run when" description="A fast model checks each event against this and skips runs that don't match">
              <textarea aria-label="Only run when" disabled={!editable} className={cn(field, "min-h-20 resize-y")} value={draft.onlyRunWhen} onChange={(event) => update("onlyRunWhen", event.target.value)} maxLength={4_000} placeholder="Describe which events should start a run…" />
            </Section>
            <Section title="Repositories" description="Attach connected repositories for investigation and proposed changes">
              <div className="rounded-lg border border-white/10 p-3">
                {context.repositories.length ? context.repositories.map((repo) => <label key={repo.id} className="flex items-center gap-2 py-1.5 text-xs text-neutral-300"><input type="checkbox" disabled={!editable || (!draft.repositoryIds.includes(repo.id) && draft.repositoryIds.length >= 10)} checked={draft.repositoryIds.includes(repo.id)} onChange={(event) => update("repositoryIds", event.target.checked ? [...draft.repositoryIds, repo.id] : draft.repositoryIds.filter((value) => value !== repo.id))} className="accent-neutral-300" /><Github className="size-3" />{repo.fullName}</label>) : <button type="button" className="text-xs text-neutral-400 underline underline-offset-4" onClick={() => onNavigate("/connections")}>Connect repositories in Connections</button>}
              </div>
            </Section>
            <Section title="Limits" description="Keep runs predictable. Daily limits reset at midnight UTC; filtered checks count toward the limit.">
              <div className="grid grid-cols-2 gap-3"><label className="text-xs text-neutral-400">Runs per day<input type="number" aria-label="Runs per day" disabled={!editable} min={1} max={100} className={cn(field, "mt-2")} value={draft.maxRunsPerDay} onChange={(event) => update("maxRunsPerDay", Number(event.target.value))} /></label><label className="text-xs text-neutral-400">Cooldown (minutes)<input type="number" aria-label="Cooldown minutes" disabled={!editable} min={0} max={1440} className={cn(field, "mt-2")} value={draft.cooldownMinutes} onChange={(event) => update("cooldownMinutes", Number(event.target.value))} /></label></div>
            </Section>
            <p className="text-xs leading-5 text-neutral-500">Nova drafts answers and PR-ready changes. It does not run shell commands, execute checks, open pull requests, or post externally.</p>
            {id && selected ? <>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button type="button" className={button} disabled={!editable || busy} onClick={() => void action(async () => { const data = await request<{ automation: AutomationDto }>(`/${id}`, "PUT", { ...selected, status: selected.status === "active" ? "paused" : "active" }); setSelected(data.automation); update("status", data.automation.status) })}>{selected.status === "active" ? <Pause className="size-3" /> : <Play className="size-3" />}{selected.status === "active" ? "Pause automation" : "Resume automation"}</button>
                <button type="button" className={button} disabled={!editable || busy || selected.status !== "active"} onClick={() => setTestOpen(true)}><Play className="size-3" />Test run</button>
                {selected.triggers.some((trigger) => trigger.type === "webhook") ? <button type="button" className={button} disabled={!editable || busy} onClick={() => void action(async () => { setCredential(await request(`/${id}/credential`, "POST")) })}>Generate / rotate webhook token</button> : null}
                <button type="button" aria-label="Delete automation" className={cn(button, "ml-auto text-red-300")} disabled={!editable || busy} onClick={() => setDeleteOpen(true)}><Trash2 className="size-3" /></button>
              </div>
              <Section title="Run history" description="Recent matches, skipped events, and results">
                {selected.runs.length ? <div className="divide-y divide-white/[0.06] rounded-lg border border-white/10">{selected.runs.map((run) => <div key={run.id} className="flex items-start gap-3 px-3 py-3"><span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", run.status === "completed" ? "bg-emerald-400" : run.status === "failed" ? "bg-red-400" : "bg-neutral-500")} /><div className="min-w-0 flex-1"><p className="text-xs capitalize">{run.status === "filtered" ? "Skipped by criteria" : run.status}</p>{run.reason ? <p className="mt-1 text-xs text-neutral-500">{run.reason}</p> : null}<p className="mt-1 text-[11px] text-neutral-600">{new Date(run.createdAt).toLocaleString()}</p></div>{run.agentSessionId ? <button type="button" className="shrink-0 text-xs text-neutral-400 hover:text-white" onClick={() => onNavigate(`/s/${run.agentSessionId}`)}>Open thread →</button> : null}</div>)}</div> : <p className="py-4 text-xs text-neutral-600">No runs yet</p>}
              </Section>
            </> : null}
          </div>
        ) : !segment ? (
          <div className="px-2 pb-10">
            <div className="flex flex-wrap items-center gap-1.5 py-2">
              {[{ id: "mine", label: "My automations" }, { id: "all", label: "All automations" }, { id: "scheduled", label: "Scheduled" }].map((item) => <button type="button" key={item.id} className={cn(button, tab === item.id ? "bg-white/[0.08] text-white" : "text-neutral-500")} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
              <div className="ml-auto flex items-center gap-2"><label className="flex items-center gap-1.5 text-neutral-500"><Search className="size-3" /><input aria-label="Search automations" value={query} onChange={(event) => setQuery(event.target.value)} className="w-24 bg-transparent text-xs outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 sm:w-40" placeholder="Search" /></label><button type="button" aria-label="Filter automations" aria-expanded={filtersOpen} className={cn(button, "px-2")} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal className="size-3" /></button></div>
            </div>
            <div className="flex items-center gap-2">
              {tab === "mine" ? <button type="button" className="flex items-center gap-2 rounded border border-white/10 px-2 py-0.5 text-[11px] text-neutral-400" onClick={() => setTab("all")}>Creator <span className="text-neutral-600">is</span> <span className="text-neutral-200">Me</span><X className="size-2.5" /></button> : null}
              {filtersOpen ? <select aria-label="Automation status filter" className={chip} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option className="bg-neutral-900" value="all">All statuses</option><option className="bg-neutral-900" value="active">Active</option><option className="bg-neutral-900" value="paused">Paused</option></select> : null}
            </div>
            {filtered.length ? <div className="my-6 space-y-2">{filtered.map((item) => <button type="button" key={item.id} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-4 text-left transition-colors hover:bg-white/[0.04]" onClick={() => onNavigate(`/automations/${item.id}`)}><ProviderIcon provider={providerFor(item.triggers[0].type)} apps={apps} /><div className="min-w-0 flex-1"><p className="truncate">{item.name}</p><p className="mt-1 text-xs text-neutral-500">{item.creatorName} · {item.triggers.map((trigger) => TRIGGER_LABELS[trigger.type]).join(", ")}</p></div><span className={cn("rounded-full border px-2 py-0.5 text-[11px]", item.status === "active" ? "border-emerald-400/15 text-emerald-300" : "border-white/10 text-neutral-500")}>{item.status}</span><ChevronRight className="size-3 text-neutral-500" /></button>)}</div> : <div className="flex min-h-36 items-center justify-center text-neutral-600">{query || statusFilter !== "all" ? "No matching automations" : "No automations yet"}</div>}
            <div className="mb-2 flex h-9 items-center gap-2 rounded-lg bg-white/[0.035] px-7 text-xs">Templates <span className="text-neutral-500">{AUTOMATION_TEMPLATES.length}</span></div>
            <div className="grid gap-2 md:grid-cols-2">{AUTOMATION_TEMPLATES.map((template) => <button type="button" key={template.id} disabled={template.comingSoon} onClick={() => onNavigate(`/automations/new?template=${template.id}`)} className="min-h-[104px] rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-neutral-400"><span className="flex items-center gap-2"><ProviderIcon provider={template.provider} apps={apps} />{template.name}</span><span className="mt-1 block text-neutral-500">{template.description}</span><span className="mt-3 flex items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5 text-[11px]"><ProviderIcon provider={template.provider} apps={apps} />{template.provider}</span>{template.comingSoon ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-400">Coming soon</span> : null}</span></button>)}</div>
          </div>
        ) : null}
      </div>
      {deleteOpen && id ? <Modal title="Delete automation?" onClose={() => setDeleteOpen(false)}><p className="text-xs leading-5 text-neutral-400">This deletes the automation and its run history. Existing Nova threads will remain.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className={button} onClick={() => setDeleteOpen(false)}>Cancel</button><button type="button" className={cn(button, "text-red-300")} disabled={busy} onClick={() => void action(async () => { await request(`/${id}`, "DELETE"); onNavigate("/automations") })}>Delete automation</button></div></Modal> : null}
      {testOpen && id ? <Modal title="Test automation" onClose={() => setTestOpen(false)}><p className="mb-3 text-xs leading-5 text-neutral-400">Provide sample event context. The saved instructions, criteria, limits, and model will be used.</p><textarea aria-label="Test event context" className={cn(field, "min-h-32")} value={testText} maxLength={24_000} onChange={(event) => setTestText(event.target.value)} placeholder="Paste a sample Slack message, GitHub event, or issue…" /><div className="mt-4 flex justify-end"><button type="button" className={button} disabled={busy || !testText.trim()} onClick={() => void action(async () => { await request(`/${id}/test`, "POST", { text: testText, deliveryId: crypto.randomUUID() }); setTestOpen(false); setNotice("Test queued. Run history will update automatically."); await refresh() })}>Queue test run</button></div></Modal> : null}
      {credential ? <Modal title="Webhook credential" onClose={() => setCredential(null)}><p className="text-xs leading-5 text-neutral-400">Shown only once. Store it securely. Rotating invalidates the previous token. Send it in the Authorization: Bearer header, with a unique X-Delivery-Id for each event. Never include secrets in the event body.</p><p className="my-3 break-all text-xs text-neutral-300">{typeof window === "undefined" ? "" : window.location.origin}{credential.path}</p><input aria-label="Webhook token" type="password" readOnly value={credential.token} className={field} /><button type="button" className={cn(button, "mt-3")} onClick={() => { void navigator.clipboard.writeText(credential.token).then(() => { setCredential(null); setNotice("Token copied. Store it securely.") }).catch(() => setError("Could not copy the token")) }}>Copy token and close</button></Modal> : null}
    </div>
  )
}

function Section({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-10"><div className="mb-3 flex items-end justify-between gap-3"><div><h2>{title}</h2><p className="mt-2 text-xs leading-5 text-neutral-500">{description}</p></div>{action}</div>{children}</section>
}

function TriggerEditor({ trigger, context, apps, disabled, onChange, onRemove }: { trigger: AutomationTrigger; context: AutomationContext; apps: AutomationApp[]; disabled: boolean; onChange: (trigger: AutomationTrigger) => void; onRemove: () => void }) {
  const provider = providerFor(trigger.type)
  return <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
    <div className="flex flex-wrap items-center gap-1.5"><ProviderIcon provider={provider} apps={apps} /><span className="mr-1 text-xs">{TRIGGER_LABELS[trigger.type]}</span>
      {trigger.type === "slack.message" ? <><input aria-label="Slack user ID filter" disabled={disabled} className={cn(chip, "w-28")} placeholder="from anyone" value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value })} /><input aria-label="Slack channel ID filter" disabled={disabled} className={cn(chip, "w-32")} placeholder="in any channel" value={trigger.channel} onChange={(event) => onChange({ ...trigger, channel: event.target.value })} /><label className="flex items-center gap-1 rounded-md bg-white/[0.08] px-2 py-1 text-xs"><input type="checkbox" disabled={disabled} checked={trigger.humansOnly} onChange={(event) => onChange({ ...trigger, humansOnly: event.target.checked })} />humans only</label></> : null}
      {trigger.type === "github.check" || trigger.type === "github.review" ? <select aria-label="Trigger repository" disabled={disabled} className={chip} value={trigger.repository} onChange={(event) => onChange({ ...trigger, repository: event.target.value })}><option className="bg-neutral-900" value="">in any repository</option>{context.repositories.map((repo) => <option className="bg-neutral-900" key={repo.id} value={repo.fullName}>{repo.fullName}</option>)}</select> : null}
      {trigger.type === "github.review" ? <input aria-label="Reviewer filter" disabled={disabled} className={cn(chip, "w-28")} placeholder="by anyone" value={trigger.actor} onChange={(event) => onChange({ ...trigger, actor: event.target.value })} /> : null}
      {trigger.type === "linear.issue" ? <input aria-label="Linear team ID" disabled={disabled} className={cn(chip, "w-32")} placeholder="in any team" value={trigger.team} onChange={(event) => onChange({ ...trigger, team: event.target.value })} /> : null}
      {trigger.type === "schedule" ? <><select aria-label="Schedule day" disabled={disabled} className={chip} value={trigger.day} onChange={(event) => onChange({ ...trigger, day: Number(event.target.value) })}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option className="bg-neutral-900" key={day} value={index}>{day}</option>)}</select><input aria-label="Schedule time" type="time" disabled={disabled} className={chip} value={`${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); onChange({ ...trigger, hour, minute }) }} /><input aria-label="Schedule timezone" disabled={disabled} className={cn(chip, "w-40")} value={trigger.timezone} placeholder="America/New_York" onChange={(event) => onChange({ ...trigger, timezone: event.target.value })} /></> : null}
      <button type="button" aria-label="Remove trigger" disabled={disabled} className="ml-auto p-1 text-neutral-500 hover:text-white disabled:opacity-30" onClick={onRemove}><X className="size-3" /></button>
    </div>
    {trigger.type === "github.check" ? <div className="mt-3 flex flex-wrap items-center gap-2 pl-5 text-xs text-neutral-500">and with conclusion {(["failure", "timed_out", "action_required", "success", "cancelled", "neutral", "skipped", "stale"] as const).map((value) => <label key={value} className="flex items-center gap-1"><input type="checkbox" disabled={disabled} checked={trigger.conclusions.includes(value)} onChange={(event) => onChange({ ...trigger, conclusions: event.target.checked ? [...trigger.conclusions, value] : trigger.conclusions.filter((item) => item !== value) })} />{value.replaceAll("_", " ")}</label>)}</div> : null}
    {trigger.type === "github.review" ? <div className="mt-3 flex flex-wrap items-center gap-2 pl-5 text-xs text-neutral-500">and with review state {(["changes_requested", "commented", "approved"] as const).map((value) => <label key={value} className="flex items-center gap-1"><input type="checkbox" disabled={disabled} checked={trigger.states.includes(value)} onChange={(event) => onChange({ ...trigger, states: event.target.checked ? [...trigger.states, value] : trigger.states.filter((item) => item !== value) })} />{value.replaceAll("_", " ")}</label>)}</div> : null}
    {trigger.type === "webhook" ? <p className="mt-2 text-xs text-neutral-500">Save the automation, then generate a secure webhook token.</p> : null}
  </div>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={onClose}><div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-xl border border-white/10 bg-[#171717] p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-medium">{title}</h2><button type="button" aria-label="Close dialog" className="text-neutral-500 hover:text-white" onClick={onClose}><X className="size-4" /></button></div>{children}</div></div>
}
