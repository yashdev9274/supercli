"use client"

import type { CSSProperties } from "react"
import { ArrowUp, Check, Monitor, Plus, RotateCcw } from "lucide-react"

import { cn } from "@/lib/utils"
import { CHAT_APPEARANCE_PRESETS, contrastingText, DEFAULT_CHAT_APPEARANCE } from "../chat-appearance"
import { AsciiBackground } from "./ascii-background"
import { useChatAppearance } from "./chat-appearance"

export function AppearanceSection() {
  const { appearance, update } = useChatAppearance()
  const text = appearance.text ?? contrastingText(appearance.background)
  const previewStyle = {
    backgroundColor: appearance.background,
    color: text,
    "--chat-bg": appearance.background,
    "--chat-text": text,
    "--chat-muted": `color-mix(in srgb, ${text} 65%, ${appearance.background})`,
    "--chat-border": `color-mix(in srgb, ${text} 8%, ${appearance.background})`,
    "--chat-hover": `color-mix(in srgb, ${text} 12%, ${appearance.background})`,
  } as CSSProperties
  const selected = CHAT_APPEARANCE_PRESETS.find((preset) => preset.background === appearance.background && preset.ascii === appearance.ascii && appearance.text === null)

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.025em]">Appearance</h1>
          <p className="mt-2 text-[13px] leading-5 text-[#92929b]">Make Nova’s new-thread canvas feel like your workspace.</p>
        </div>
        <button type="button" onClick={() => update(DEFAULT_CHAT_APPEARANCE)} className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] px-2.5 text-[12px] text-[#a1a1aa] transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-white/60">
          <RotateCcw className="size-3.5" />Restore defaults
        </button>
      </header>

      <section aria-labelledby="appearance-themes">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <h2 id="appearance-themes" className="text-[13px] text-[#a1a1aa]">Theme</h2>
          <span className="text-[12px] text-[#71717a]">{selected?.name ?? "Custom"}</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-xl border border-white/[0.08] bg-[#151517] p-4 sm:grid-cols-3 lg:grid-cols-5">
          {CHAT_APPEARANCE_PRESETS.map((preset) => {
            const active = selected?.name === preset.name
            const foreground = contrastingText(preset.background)
            return (
              <button key={preset.name} type="button" aria-label={`${preset.name} theme`} aria-pressed={active} onClick={() => update({ background: preset.background, ascii: preset.ascii, text: null })} className="group min-w-0 rounded-lg text-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/60">
                <span style={{ backgroundColor: preset.background, color: foreground }} className={cn("relative flex aspect-[1.5] overflow-hidden rounded-lg border p-2 transition group-hover:border-white/40", active ? "border-[#a1a1aa] ring-1 ring-white/20" : "border-white/[0.12]")}>
                  <span className="w-3 shrink-0 border-r border-current/10 pr-1"><span className="block h-1 w-full rounded-sm bg-current/20" /></span>
                  <span className="flex min-w-0 flex-1 flex-col pl-2 pt-1">
                    <span className="mb-1 h-1 w-4/5 rounded-sm bg-current/40" />
                    <span className="h-1 w-1/2 rounded-sm bg-current/20" />
                    <span className="mt-auto flex h-4 items-center justify-end rounded border border-current/15 px-1"><span style={{ backgroundColor: preset.ascii }} className="size-1.5 rounded-sm" /></span>
                  </span>
                  {active ? <span className="absolute right-1 top-1 rounded-full bg-[#ededf0] p-0.5 text-[#151517]"><Check className="size-2.5" /></span> : null}
                </span>
                <span className={cn("mt-2 block text-[12px]", active ? "text-[#ededf0]" : "text-[#92929b] group-hover:text-[#ededf0]")}>{preset.name}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="appearance-colors">
        <h2 id="appearance-colors" className="mb-3 px-1 text-[13px] text-[#a1a1aa]">Colors</h2>
        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.08] bg-[#151517]">
          <AppearanceColorRow label="Background" description="The canvas behind a new conversation." value={appearance.background} onChange={(background) => update({ ...appearance, background })} />
          <AppearanceColorRow label="ASCII animation" description="The color of Nova’s animated background." value={appearance.ascii} onChange={(ascii) => update({ ...appearance, ascii })} />
          <AppearanceColorRow label="Text" description={appearance.text === null ? "Chosen automatically for your background." : "Your custom canvas text color."} value={text} onChange={(color) => update({ ...appearance, text: color })} />
          <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-4">
            <span><span className="block text-[13px]">Automatic text contrast</span><span className="mt-1 block text-[12px] text-[#92929b]">Keep text readable when the background changes.</span></span>
            <input type="checkbox" checked={appearance.text === null} onChange={(event) => update({ ...appearance, text: event.target.checked ? null : text })} className="size-4 shrink-0 accent-[#ededf0] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/60" />
          </label>
        </div>
      </section>

      <section aria-labelledby="appearance-preview">
        <h2 id="appearance-preview" className="mb-3 px-1 text-[13px] text-[#a1a1aa]">Preview</h2>
        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          <div style={previewStyle} className="relative isolate flex min-h-[280px] flex-col items-center justify-center gap-9 overflow-hidden px-6 py-12">
            <AsciiBackground color={appearance.ascii} />
            <p className="relative z-[1] text-center text-[20px] tracking-[-0.03em]">What should we work on?</p>
            <div aria-hidden="true" style={{ backgroundColor: `color-mix(in srgb, ${text} 3%, ${appearance.background})`, borderColor: `color-mix(in srgb, ${text} 8%, ${appearance.background})` }} className="relative z-[1] w-full max-w-[380px] rounded-2xl border p-3.5">
              <span className="text-[12px] opacity-50">Ask Nova anything…</span>
              <div className="mt-9 flex items-center justify-between opacity-60"><Plus className="size-3.5" /><ArrowUp className="size-5 rounded-full border border-current/20 p-0.5" /></div>
            </div>
          </div>
          <div className="flex items-start gap-2.5 border-t border-white/[0.06] bg-[#151517] px-4 py-3 text-[12px] leading-5 text-[#92929b]">
            <Monitor className="mt-0.5 size-3.5 shrink-0" />
            <p>Saved automatically in this browser. These settings also update the Appearance picker on the home screen; they don’t change your editor or sync to other devices.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function AppearanceColorRow({ label, description, value, onChange }: {
  label: string
  description: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div><p className="text-[13px]">{label}</p><p className="mt-1 text-[12px] text-[#92929b]">{description}</p></div>
      <div className="flex shrink-0 items-center gap-2">
        <input type="color" aria-label={`${label} color`} value={value} onChange={(event) => onChange(event.target.value)} className="size-8 cursor-pointer rounded-lg border border-white/[0.1] bg-transparent p-1 focus-visible:outline-2 focus-visible:outline-white/60" />
        <input key={value} type="text" aria-label={`${label} hex color`} defaultValue={value} maxLength={7} spellCheck={false} onBlur={(event) => {
          const next = event.target.value.trim()
          if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase())
          else event.target.value = value
        }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur() }} className="h-8 w-[96px] rounded-lg border border-white/[0.1] bg-transparent px-2.5 font-mono text-[12px] text-[#d4d4d8] outline-none focus:border-white/40" />
      </div>
    </div>
  )
}
