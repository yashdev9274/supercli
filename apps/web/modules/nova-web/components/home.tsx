"use client"

import { useState } from "react"
import { ChevronDown, Cloud, FolderGit2 } from "lucide-react"

import { Composer } from "@/modules/nova-web/components/composer"
import type { NovaReference } from "@/modules/nova/references/contracts"
import type {
  HarnessProvider,
  NovaAgentMode,
  NovaEffort,
} from "@/modules/nova-web/models"

const STARTERS = [
  "Review open pull requests and flag blockers",
  "Summarize what changed across Linear this week",
  "Draft a release plan for the current branch",
]

/** Dot-field canvas matching Capy's empty new-thread state. */
function DotField() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at center, rgba(45,212,191,0.55) 0.55px, transparent 0.65px)",
        backgroundSize: "14px 14px",
        maskImage:
          "radial-gradient(ellipse 70% 55% at 70% 18%, black 0%, transparent 72%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 55% at 70% 18%, black 0%, transparent 72%)",
        opacity: 0.35,
      }}
    />
  )
}

export function EmptyHome({
  onStart,
  busy,
  model,
  provider,
  effort,
  mode,
  onModelChange,
  onEffortChange,
  onModeChange,
}: {
  onStart: (value: string, references?: NovaReference[]) => void
  busy?: boolean
  model: string
  provider: HarnessProvider
  effort: NovaEffort
  mode: NovaAgentMode
  onModelChange: (selection: { provider: HarnessProvider; model: string }) => void
  onEffortChange: (effort: NovaEffort) => void
  onModeChange: (mode: NovaAgentMode) => void
}) {
  const [draft, setDraft] = useState("")
  const [references, setReferences] = useState<NovaReference[]>([])

  function submit(value = draft) {
    const objective = value.trim()
    if (!objective || busy) return
    onStart(objective, references)
    setDraft("")
    setReferences([])
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <DotField />
      <div className="relative z-[1] flex flex-1 flex-col items-center justify-center px-5 pb-24">
        <div className="mb-3 flex items-center gap-3 text-[12px] text-[#5c5c5c]">
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-white/[0.04] hover:text-[#a0a0a0]"
          >
            <FolderGit2 className="size-3.5" strokeWidth={1.75} />
            Company
            <ChevronDown className="size-3 opacity-70" />
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-white/[0.04] hover:text-[#a0a0a0]"
          >
            <Cloud className="size-3.5" strokeWidth={1.75} />
            Web harness
            <ChevronDown className="size-3 opacity-70" />
          </button>
        </div>

        <div className="w-full max-w-[640px]">
          <Composer
            value={draft}
            onChange={setDraft}
            references={references}
            onReferencesChange={setReferences}
            onSubmit={() => submit()}
            large
            disabled={busy}
            model={model}
            provider={provider}
            effort={effort}
            mode={mode}
            onModelChange={onModelChange}
            onEffortChange={onEffortChange}
            onModeChange={onModeChange}
            placeholder="Ask to make changes, @mention files, run /commands"
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={busy}
                onClick={() => submit(starter)}
                className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12px] text-[#5c5c5c] transition hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-[#a0a0a0] disabled:opacity-50"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
