"use client"

import { useEffect, useState } from "react"
import { CalendarDays, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { createAgentRoutine, deleteAgentRoutine, listAgentRoutines, updateAgentRoutine, type AgentRoutine } from "@/modules/nova-web/api"

const button = "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.025] px-3 text-xs text-neutral-300 transition hover:bg-white/[0.07] disabled:opacity-40"
const input = "h-9 w-full rounded-lg border border-white/10 bg-[#202020] px-3 text-[12px] text-white outline-none focus:border-white/25"

const emptyDraft = () => ({
  name: "Morning brief",
  instructions: "Review my calendar and prepare the most important priorities for today.",
  scheduleType: "daily" as "daily" | "weekly",
  dayOfWeek: 1 as number | null,
  hour: 9,
  minute: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  requiresCalendar: true,
  separateThread: false,
  status: "active" as "active" | "paused",
})

type RoutineDraft = ReturnType<typeof emptyDraft>

export function AgentRoutinesCard({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [routines, setRoutines] = useState<AgentRoutine[]>([])
  const [selected, setSelected] = useState<AgentRoutine | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calendar, setCalendar] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<RoutineDraft>(emptyDraft)

  async function refresh() {
    setLoading(true)
    try {
      const result = await listAgentRoutines(agentId)
      setRoutines(result.routines)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load routines")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!agentId) {
      setLoading(false)
      return
    }
    void refresh()
    void checkCalendar()
  }, [agentId])

  function edit(routine: AgentRoutine) {
    setSelected(routine)
    setDraft({
      name: routine.name,
      instructions: routine.instructions,
      scheduleType: routine.scheduleType,
      dayOfWeek: routine.dayOfWeek,
      hour: routine.hour,
      minute: routine.minute,
      timezone: routine.timezone,
      requiresCalendar: routine.requiresCalendar,
      separateThread: routine.separateThread,
      status: routine.status,
    })
  }

  function newRoutine() {
    setSelected(null)
    setDraft(emptyDraft())
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const result = selected
        ? await updateAgentRoutine(agentId, selected.id, draft)
        : await createAgentRoutine(agentId, draft)
      setRoutines((current) => selected
        ? current.map((item) => item.id === result.routine.id ? result.routine : item)
        : [result.routine, ...current])
      setSelected(result.routine)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save routine")
    } finally {
      setSaving(false)
    }
  }

  async function checkCalendar() {
    try {
      const response = await fetch("/api/nova/composio/apps", { cache: "no-store" })
      const body = await response.json()
      const app = body?.apps?.find((item: { slug?: string }) => item.slug === "googlecalendar")
      setCalendar(Boolean(app?.connected))
    } catch {
      setCalendar(false)
    }
  }

  async function connectCalendar() {
    try {
      const response = await fetch("/api/nova/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: "googlecalendar" }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not start Google Calendar connection")
      if (body.redirectUrl) window.open(body.redirectUrl, "_blank", "noopener,noreferrer")
      setError("Finish Google Calendar connection in the new tab, then return here and refresh.")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect Google Calendar")
    }
  }

  async function remove(id: string) {
    setSaving(true)
    try {
      await deleteAgentRoutine(agentId, id)
      setRoutines((current) => current.filter((item) => item.id !== id))
      if (selected?.id === id) newRoutine()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete routine")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent showCloseButton={false} className="max-h-[calc(100vh-32px)] gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#181818] p-0 text-[#ededed] shadow-2xl sm:max-w-[760px]">
        <DialogTitle className="sr-only">Agent routines</DialogTitle>
        <DialogDescription className="sr-only">Edit scheduled routines for this agent.</DialogDescription>
        <div className="flex max-h-[calc(100vh-32px)] w-full flex-col overflow-hidden">
          <div className="flex h-12 items-center gap-2 border-b border-white/[0.07] px-4">
            <button type="button" onClick={onClose} className="text-xs text-neutral-400 hover:text-white">Settings</button>
            <ChevronRight className="size-3 text-neutral-600" />
            <span className="text-xs">Routines</span>
            <button type="button" className="ml-auto" onClick={onClose}>×</button>
          </div>
          <div className="grid min-h-0 flex-1 md:grid-cols-[230px_1fr]">
            <aside className="border-b border-white/[0.07] p-3 md:border-b-0 md:border-r">
              <button type="button" className={cn(button, "mb-3 w-full")} onClick={newRoutine}>
                <Plus className="size-3.5" />New routine
              </button>
              {loading ? <p className="p-3 text-xs text-neutral-500">Loading…</p> : routines.length ? routines.map((routine) => (
                <button key={routine.id} type="button" onClick={() => edit(routine)} className={cn("mb-1 w-full rounded-lg px-3 py-2 text-left", selected?.id === routine.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]")}>
                  <span className="block truncate text-xs">{routine.name}</span>
                  <span className="mt-1 block text-[10px] text-neutral-500">{routine.status} · {routine.scheduleType}</span>
                </button>
              )) : <p className="p-3 text-xs text-neutral-600">No routines yet.</p>}
            </aside>
            <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">Routine</h2>
                  <p className="mt-1 text-[11px] text-neutral-500">Runs this NovaBot agent on a schedule.</p>
                </div>
                <button type="button" className={button} disabled={saving || !selected} onClick={() => selected && void remove(selected.id)}>
                  <Trash2 className="size-3.5" />Delete
                </button>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block text-xs text-neutral-300">Name
                  <input className={cn(input, "mt-1.5")} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-[1fr_110px_110px]">
                  <label className="block text-xs text-neutral-300">Frequency
                    <select className={cn(input, "mt-1.5")} value={draft.scheduleType} onChange={(event) => setDraft({ ...draft, scheduleType: event.target.value as "daily" | "weekly" })}>
                      <option value="daily">Every day</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                  {draft.scheduleType === "weekly" ? <label className="block text-xs text-neutral-300">Day
                    <select className={cn(input, "mt-1.5")} value={draft.dayOfWeek ?? 1} onChange={(event) => setDraft({ ...draft, dayOfWeek: Number(event.target.value) })}>
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
                    </select>
                  </label> : <div />}
                  <label className="block text-xs text-neutral-300">Time
                    <input type="time" className={cn(input, "mt-1.5")} value={`${String(draft.hour).padStart(2, "0")}:${String(draft.minute).padStart(2, "0")}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":").map(Number); setDraft({ ...draft, hour, minute }) }} />
                  </label>
                </div>
                <label className="block text-xs text-neutral-300">Timezone
                  <input className={cn(input, "mt-1.5")} value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} />
                </label>
                <label className="block text-xs text-neutral-300">Instruction
                  <textarea className="mt-1.5 min-h-28 w-full rounded-lg border border-white/10 bg-[#202020] px-3 py-2 text-xs leading-5 text-white outline-none focus:border-white/25" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
                </label>
                <div className="rounded-lg border border-white/10 bg-[#202020] p-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-neutral-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">Google Calendar</p>
                      <p className="mt-1 text-[11px] text-neutral-500">{calendar === null ? "Checking connection…" : calendar ? "Connected through Composio" : "Not connected"}</p>
                    </div>
                    {calendar ? <span className="text-[11px] text-emerald-300">Connected</span> : <div className="flex gap-1">
                      <button type="button" className={button} onClick={() => void checkCalendar()}>Check</button>
                      <button type="button" className={button} onClick={() => void connectCalendar()}>Connect</button>
                    </div>}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs text-neutral-300">
                    <input type="checkbox" checked={draft.requiresCalendar} onChange={(event) => setDraft({ ...draft, requiresCalendar: event.target.checked })} />Use Google Calendar for this routine
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={draft.status === "active"} onChange={(event) => setDraft({ ...draft, status: event.target.checked ? "active" : "paused" })} />Active
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-300">
                  <input type="checkbox" checked={draft.separateThread} onChange={(event) => setDraft({ ...draft, separateThread: event.target.checked })} />Run in a separate thread
                </label>
              </div>
              {error ? <p role="alert" className="mt-4 text-xs text-amber-200">{error}</p> : null}
              <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
                <button type="button" className={button} onClick={onClose}>Cancel</button>
                <button type="button" className="inline-flex h-8 items-center gap-2 rounded-md bg-white px-4 text-xs font-medium text-black disabled:opacity-40" disabled={saving || !draft.name.trim() || !draft.instructions.trim()} onClick={() => void save()}>
                  {saving ? <Loader2 className="size-3 animate-spin" /> : null}Save
                </button>
              </div>
            </main>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
