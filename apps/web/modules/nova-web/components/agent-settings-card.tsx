"use client"

import { useEffect, useState } from "react"
import { BotAvatar, type BotAvatarType } from "bot-avatars"
import { Bell, Brain, Check, ChevronRight, FileText, Loader2, Pencil, Upload } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { updateAgent } from "@/modules/nova-web/api"
import { AgentModelPicker, AGENT_COLORS } from "@/modules/nova-web/components/agents"
import { AgentRoutinesCard } from "@/modules/nova-web/components/agent-routines-card"
import { CLOUD_MODELS, modelChipLabel, type HarnessProvider, type NovaEffort } from "@/modules/nova-web/models"
import { modelLogo, PROVIDER_LOGOS } from "@/modules/nova-web/model-logos"
import type { NovaAgent } from "@/modules/nova-web/types"

export function AgentSettingsCard({ agent, onClose, onSaved }: { agent: NovaAgent | null; onClose: () => void; onSaved: (agent: NovaAgent) => void }) {
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [colorDialogOpen, setColorDialogOpen] = useState(false)
  const [contextDialogOpen, setContextDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [routinesOpen, setRoutinesOpen] = useState(false)
  const [modelProvider, setModelProvider] = useState<HarnessProvider>("supercode")
  const [model, setModel] = useState(CLOUD_MODELS[0]?.id ?? "")
  const [effort, setEffort] = useState<NovaEffort>("high")
  const [chatColor, setChatColor] = useState("#3b93ed")
  const [instructions, setInstructions] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agent) return
    setModelProvider((agent.provider || "supercode") as HarnessProvider)
    setModel(agent.model || CLOUD_MODELS[0]?.id || "")
    setEffort((agent.effort || "high") as NovaEffort)
    setChatColor(agent.avatarColor || "#3b93ed")
    setInstructions(agent.instructions)
    setError(null)
  }, [agent])

  async function savePatch(patch: Parameters<typeof updateAgent>[1], close?: () => void) {
    if (!agent || saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await updateAgent(agent.id, patch)
      onSaved(result.agent)
      close?.()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save agent settings")
    } finally {
      setSaving(false)
    }
  }

  function publish() {
    return savePatch({ provider: modelProvider, model, effort, avatarColor: chatColor, instructions: instructions.trim() || agent?.instructions, status: "active" }, () => setPublishDialogOpen(false))
  }

  const selectedLogo = PROVIDER_LOGOS[modelProvider] ?? modelLogo({ id: model, provider: modelProvider, label: modelChipLabel(modelProvider, model), desc: "" })
  const updatedLabel = agent ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(agent.updatedAt)) : ""

  return (
    <Dialog open={agent !== null} onOpenChange={(open) => { if (!open && !saving) onClose() }}>
      <DialogContent className="gap-0 overflow-hidden rounded-2xl border-white/10 bg-[#181818] p-0 text-[#ededed] shadow-2xl sm:max-w-[422px]">
        {agent ? (
          <div>
            <div className="relative px-6 pb-5 pt-8 text-center">
              <div className="mx-auto flex size-[74px] items-center justify-center rounded-full bg-white/[0.035] ring-1 ring-white/[0.06]">
                <BotAvatar type={(agent.avatarType as BotAvatarType) || "clover"} color={chatColor} size={62} state="default" seed={agent.id.length / 10} interactive={false} />
              </div>
              <DialogTitle className="mt-4 text-[17px] font-medium tracking-[-0.02em]">{agent.name}</DialogTitle>
              <p className="mt-1 text-[12px] text-[#8f8f8f]">Last updated {updatedLabel}</p>
              <DialogDescription className="mx-auto mt-3 max-w-[330px] text-[13px] leading-[1.35] text-[#c5c5c5]">{agent.description || "Configure how this NovaBot works across its chats."}</DialogDescription>
              <button type="button" aria-label="Edit agent context" onClick={() => setContextDialogOpen(true)} className="absolute right-4 top-4 flex size-6 items-center justify-center rounded-md text-[#8b8b8b] hover:bg-white/[0.07] hover:text-white"><Pencil className="size-3.5" /></button>
            </div>

            <div className="mx-[18px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#202020]">
              <SettingsRow icon={<ProviderLogo src={selectedLogo.src} alt={`${modelProvider} logo`} monochrome={selectedLogo.monochrome} />} label="Model" value={modelChipLabel(modelProvider, model)} onClick={() => setModelDialogOpen(true)} />
              <SettingsRow icon={<span className="size-3 rounded-full" style={{ backgroundColor: chatColor }} />} label="Chat color" value={colorLabel(chatColor)} onClick={() => setColorDialogOpen(true)} />
              <SettingsRow icon={<FileText />} label="Context" value="Instructions" onClick={() => setContextDialogOpen(true)} />
              <SettingsRow icon={<Bell />} label="Routines" value="Schedule this agent" onClick={() => setRoutinesOpen(true)} />
            </div>

            <div className="flex items-center justify-end border-t border-white/[0.07] px-5 py-4">
              <button type="button" onClick={() => setPublishDialogOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#f1f1f1] px-4 text-[12px] font-medium text-[#171717] transition hover:bg-white"><Upload className="size-3.5" />{agent.status === "active" ? "Publish" : "Publish agent"}</button>
            </div>
          </div>
        ) : null}
      </DialogContent>

      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
        <DialogContent className="gap-0 rounded-2xl border-white/10 bg-[#181818] p-5 text-[#ededed] sm:max-w-[440px]">
          <DialogTitle className="text-sm font-medium">Choose model</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#888]">This model will be used for new chats and scheduled routines.</DialogDescription>
          <div className="mt-4"><AgentModelPicker provider={modelProvider} model={model} effort={effort} onEffortChange={setEffort} onChange={(selection) => { setModelProvider(selection.provider); setModel(selection.model) }} /></div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setModelDialogOpen(false)} className="rounded-lg px-3 py-2 text-[12px] text-[#999] hover:bg-white/[0.06]">Done</button><button type="button" onClick={() => void savePatch({ provider: modelProvider, model, effort }, () => setModelDialogOpen(false))} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-[#171717] disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}Save model</button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={colorDialogOpen} onOpenChange={setColorDialogOpen}>
        <DialogContent className="gap-0 rounded-2xl border-white/10 bg-[#181818] p-5 text-[#ededed] sm:max-w-[360px]">
          <DialogTitle className="text-sm font-medium">Choose chat color</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#888]">This color identifies the agent across Nova chats.</DialogDescription>
          <div className="mt-5 grid grid-cols-8 gap-3">{AGENT_COLORS.map((color) => <button key={color} type="button" aria-label={`Use ${color} chat color`} aria-pressed={chatColor === color} onClick={() => { setChatColor(color); void savePatch({ avatarColor: color }, () => setColorDialogOpen(false)) }} className="flex size-7 items-center justify-center rounded-full border border-transparent transition hover:scale-110" style={{ backgroundColor: color }}>{chatColor === color ? <Check className="size-3.5 text-white drop-shadow" /> : null}</button>)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={contextDialogOpen} onOpenChange={setContextDialogOpen}>
        <DialogContent className="gap-0 rounded-2xl border-white/10 bg-[#181818] p-5 text-[#ededed] sm:max-w-[520px]">
          <DialogTitle className="text-sm font-medium">Agent instructions</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-[#888]">Describe how {agent?.name ?? "this agent"} should work.</DialogDescription>
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} className="mt-4 min-h-36 w-full resize-y rounded-lg border border-white/10 bg-[#202020] px-3 py-2 text-[13px] leading-5 text-white outline-none focus:border-white/25" />
          <div className="mt-4 flex justify-end"><button type="button" onClick={() => void savePatch({ instructions: instructions.trim() }, () => setContextDialogOpen(false))} disabled={saving || !instructions.trim()} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-[#171717] disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}Save instructions</button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="gap-0 rounded-2xl border-white/10 bg-[#181818] p-5 text-[#ededed] sm:max-w-[420px]">
          <DialogTitle className="text-sm font-medium">Publish {agent?.name ?? "agent"}?</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5 text-[#888]">Publishing makes this agent active for you. Active routines will run automatically at their scheduled times.</DialogDescription>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setPublishDialogOpen(false)} className="rounded-lg px-3 py-2 text-[12px] text-[#999] hover:bg-white/[0.06]">Cancel</button><button type="button" onClick={() => void publish()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-[12px] font-medium text-[#171717] disabled:opacity-40">{saving ? <Loader2 className="size-3.5 animate-spin" /> : null}{saving ? "Publishing…" : "Publish agent"}</button></div>
        </DialogContent>
      </Dialog>

      {error ? <p role="alert" className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-red-400/20 bg-[#2a1717] px-3 py-2 text-[12px] text-red-300">{error}</p> : null}
      {routinesOpen ? <AgentRoutinesCard agentId={agent?.id ?? ""} onClose={() => setRoutinesOpen(false)} /> : null}
    </Dialog>
  )
}

function SettingsRow({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className="flex min-h-[66px] w-full items-center gap-3 border-b border-white/[0.07] px-4 text-left last:border-b-0 hover:bg-white/[0.035]"><span className="flex size-5 shrink-0 items-center justify-center text-[#c7c7c7] [&>svg]:size-4">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[13px] text-[#f0f0f0]">{label}</span>{value ? <span className="mt-1 block truncate text-[12px] text-[#929292]">{value}</span> : null}</span><ChevronRight className="size-4 shrink-0 text-[#8d8d8d]" /></button>
}

function ProviderLogo({ src, alt, monochrome }: { src: string; alt: string; monochrome: boolean }) {
  return <span className="flex size-5 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/[0.08]"><img src={src} alt={alt} className={`size-4 object-contain ${monochrome ? "brightness-0 invert opacity-80" : ""}`} /></span>
}

function colorLabel(color: string) {
  const index = AGENT_COLORS.indexOf(color)
  return ["Blue", "Red", "Orange", "Yellow", "Lime", "Mint", "Teal", "Sky", "Indigo", "Violet", "Magenta", "Pink", "Crimson", "Ochre", "Sand", "Gray"][index] ?? "Custom"
}
