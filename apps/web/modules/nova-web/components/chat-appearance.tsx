"use client"

import { useMemo, useSyncExternalStore } from "react"
import { Palette, RotateCcw } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { contrastingText, DEFAULT_CHAT_APPEARANCE, parseChatAppearance, type ChatAppearance } from "@/modules/nova-web/chat-appearance"

const STORAGE_KEY = "nova:chat-appearance:v1"
const CHANGE_EVENT = "nova:chat-appearance-change"
const PRESETS = [
  { name: "Graphite", background: "#101010", ascii: "#a3aaa7" },
  { name: "Midnight", background: "#0b172b", ascii: "#60a5fa" },
  { name: "Forest", background: "#0c211b", ascii: "#6ee7b7" },
  { name: "Ember", background: "#25140e", ascii: "#fb923c" },
  { name: "Paper", background: "#f1eee7", ascii: "#786c58" },
]

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

let memoryValue: string | null = null

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryValue
  } catch {
    return memoryValue
  }
}

function getServerSnapshot(): null {
  return null
}

export function useChatAppearance() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const appearance = useMemo(() => parseChatAppearance(raw), [raw])
  function update(next: ChatAppearance) {
    memoryValue = JSON.stringify(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, memoryValue)
    } catch {
      // Keep session preferences usable when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }
  return { appearance, update }
}

export function ChatAppearancePicker({ appearance, onChange }: {
  appearance: ChatAppearance
  onChange: (value: ChatAppearance) => void
}) {
  const text = appearance.text ?? contrastingText(appearance.background)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Customize chat appearance" className="absolute top-4 right-4 z-10 flex h-8 items-center gap-2 rounded-full border border-current/15 bg-[var(--chat-bg)] px-3 text-xs text-[var(--chat-text)] shadow-sm transition hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4">
          <Palette className="size-3.5" aria-hidden="true" />
          Appearance
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 rounded-2xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Chat appearance</h2>
          <button type="button" aria-label="Reset chat appearance" title="Reset appearance" onClick={() => onChange(DEFAULT_CHAT_APPEARANCE)} className="rounded-md p-1.5 hover:bg-muted focus-visible:outline-2">
            <RotateCcw className="size-3.5" />
          </button>
        </div>
        <div className="mb-4 flex gap-2">
          {PRESETS.map((preset) => (
            <button key={preset.name} type="button" title={preset.name} aria-label={`${preset.name} color preset`} aria-pressed={appearance.background === preset.background && appearance.ascii === preset.ascii} onClick={() => onChange({ background: preset.background, ascii: preset.ascii, text: null })} style={{ backgroundColor: preset.background, color: preset.ascii }} className="flex size-9 items-center justify-center rounded-full border border-current/30 font-mono text-sm transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover">
              #
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <ColorPicker label="Background" value={appearance.background} onChange={(background) => onChange({ ...appearance, background })} />
          <ColorPicker label="ASCII animation" value={appearance.ascii} onChange={(ascii) => onChange({ ...appearance, ascii })} />
          <ColorPicker label="Text" value={text} onChange={(color) => onChange({ ...appearance, text: color })} />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={appearance.text === null} onChange={(event) => onChange({ ...appearance, text: event.target.checked ? null : text })} className="size-3.5 accent-current" />
            Automatically contrast text with background
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ColorPicker({ label, value, onChange }: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      {label}
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase text-muted-foreground">{value}</span>
        <input type="color" aria-label={`${label} color`} value={value} onChange={(event) => onChange(event.target.value)} className="size-7 cursor-pointer rounded border border-border bg-transparent p-0.5" />
      </span>
    </label>
  )
}
