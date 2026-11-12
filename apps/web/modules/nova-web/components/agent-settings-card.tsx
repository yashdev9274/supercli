"use client"

import { useEffect, useState } from "react"
import { BotAvatar, type BotAvatarType } from "bot-avatars"
import { Bell, Brain, ChevronRight, FileText, Folder, Gauge, KeyRound, Loader2, Pencil, Puzzle, Shield, Table2, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { modelChipLabel } from "@/modules/nova-web/models"
import { updateAgent } from "@/modules/nova-web/api"
import type { NovaAgent } from "@/modules/nova-web/types"

export function AgentSettingsCard({ agent, onClose, onSaved }: { agent: NovaAgent | null; onClose: () => void; onSaved: (agent: NovaAgent) => void }) {
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [instructions, setInstructions] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agent) return
    setName(agent.name)
    setTitle("")
    setDescription(agent.description)
    setInstructions(agent.instructions)
    setError(null)
  }, [agent])

  async function save() {
    if (!agent || !name.trim() || !instructions.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await updateAgent(agent.id, { name: name.trim(), description: description.trim(), instructions: instructions.trim() })
      onSaved(result.agent)
      onClose()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save agent settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={agent !== null} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="max-h-[calc(100vh-24px)] gap-0 overflow-y-auto rounded-2xl border-white/10 bg-[#181818] p-0 text-[#ededed] sm:max-w-[800px]">
        {agent ? (
          <div className="p-4 sm:p-6">
            <div className="flex flex-col items-center border-b border-white/[0.07] pb-5">
              <div className="relative">
                <BotAvatar type={(agent.avatarType as BotAvatarType) || "clover"} color={agent.avatarColor || "#3b93ed"} size={66} state="default" seed={agent.id.length / 10} interactive={false} />
                <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full border border-[#181818] bg-[#2b2b2b] text-[#d0d0d0]"><Pencil className="size-2.5" /></span>
              </div>
              <DialogTitle className="sr-only">{agent.name} settings</DialogTitle>
              <DialogDescription className="sr-only">Configure how this NovaBot works across its chats.</DialogDescription>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-[12px] text-[#bdbdbd]">Name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#202020] px-3 text-[13px] text-white outline-none focus:border-white/25" /></label>
              <label className="block text-[12px] text-[#bdbdbd]">Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Describe what your agent does" className="mt-1.5 h-9 w-full rounded-lg border border-white/10 bg-[#202020] px-3 text-[13px] text-white outline-none placeholder:text-[#888] focus:border-white/25" /></label>
              <label className="block text-[12px] text-[#bdbdbd]">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-[#202020] px-3 py-2 text-[13px] leading-5 text-white outline-none focus:border-white/25" /></label>
              <label className="block text-[12px] text-[#bdbdbd]">Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} className="mt-1.5 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-[#202020] px-3 py-2 text-[13px] leading-5 text-white outline-none focus:border-white/25" /></label>
            </div>

            <SettingsSection title="Brain">
              <SettingsRow icon={<Brain />} label="Model" value={modelChipLabel(agent.provider, agent.model)} />
              <SettingsRow icon={<Gauge />} label="Backup models" value="Ask first" />
              <SettingsRow icon={<span className="size-3.5 rounded-full bg-orange-400" />} label="Chat color" value="Orange" />
            </SettingsSection>
            <SettingsSection title="Knows">
              <SettingsRow icon={<FileText />} label="Instructions" value="Configured" />
              <SettingsRow icon={<Brain />} label="Memories" value="0 saved" />
              <SettingsRow icon={<Puzzle />} label="Skills" value="0 assigned" />
              <SettingsRow icon={<Folder />} label="Files" value="20 KB" />
              <SettingsRow icon={<Table2 />} label="Tables" value="0 tables" />
            </SettingsSection>
            <SettingsSection title="Does">
              <SettingsRow icon={<Bell />} label="Routines" value="0 configured" />
              <SettingsRow icon={<Gauge />} label="Usage" />
              <SettingsRow icon={<Upload />} label="Publish agent" />
            </SettingsSection>
            <SettingsSection title="Rules">
              <SettingsRow icon={<Shield />} label="Permissions" value="Full access" />
              <SettingsRow icon={<Folder />} label="Folders" value="All files" />
              <SettingsRow icon={<KeyRound />} label="Advanced" />
            </SettingsSection>
            <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[#202020]"><SettingsRow icon={<Bell />} label="Notify me" value="Server default (All activity)" /></div>
            <p className="mt-3 px-1 text-[11px] leading-4 text-[#777]">This choice is only for you and applies on all your devices. When the server is muted or set to Nothing, this agent stays silent too.</p>

            {error ? <p role="alert" className="mt-4 text-[12px] text-red-300">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-[12px] text-[#999] hover:bg-white/[0.06]">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={saving || !name.trim() || !instructions.trim()} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[12px] font-medium text-[#171717] hover:bg-[#d9d9d9] disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><p className="mb-2 text-[11px] font-medium text-[#777]">{title}</p><div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#202020]">{children}</div></section>
}

function SettingsRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return <button type="button" className="flex h-11 w-full items-center gap-3 border-b border-white/[0.06] px-3 text-left last:border-b-0 hover:bg-white/[0.035]"><span className="flex size-4 items-center justify-center text-[#bcbcbc] [&>svg]:size-3.5">{icon}</span><span className="min-w-0 flex-1 text-[12.5px] text-[#ededed]">{label}</span>{value ? <span className="max-w-[55%] truncate text-[11px] text-[#999]">{value}</span> : null}<ChevronRight className="size-3.5 shrink-0 text-[#777]" /></button>
}
