"use client"

import { useState, type CSSProperties, type ReactNode } from "react"
import { ChevronDown, Cloud } from "lucide-react"

import { AsciiBackground } from "@/modules/nova-web/components/ascii-background"
import { Composer } from "@/modules/nova-web/components/composer"
import { NovaIcon } from "@/modules/nova-web/components/nova-icon"
import { ChatAppearancePicker, useChatAppearance } from "@/modules/nova-web/components/chat-appearance"
import { contrastingText } from "@/modules/nova-web/chat-appearance"
import { ProjectPicker, type ProjectSelection } from "@/modules/nova-web/components/project-picker"
import type { LocalAttachment } from "@/modules/nova/attachments/contracts"
import type { LocalProjectDto } from "@/modules/nova-web/api"
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
  onProjectChange,
  onManageProjects,
  localProject,
  workspaceControls,
}: {
  onStart: (value: string, references?: NovaReference[], localFiles?: LocalAttachment[]) => void
  busy?: boolean
  model: string
  provider: HarnessProvider
  effort: NovaEffort
  mode: NovaAgentMode
  onModelChange: (selection: { provider: HarnessProvider; model: string }) => void
  onEffortChange: (effort: NovaEffort) => void
  onModeChange: (mode: NovaAgentMode) => void
  onProjectChange?: (selection: ProjectSelection) => void
  onManageProjects?: () => void
  localProject?: LocalProjectDto | null
  workspaceControls?: ReactNode
}) {
  const { appearance, update } = useChatAppearance()
  const text = appearance.text ?? contrastingText(appearance.background)
  const theme = {
    "--chat-bg": appearance.background,
    "--chat-text": text,
    "--chat-muted": `color-mix(in srgb, ${text} 65%, ${appearance.background})`,
    "--chat-border": `color-mix(in srgb, ${text} 8%, ${appearance.background})`,
    "--chat-surface": `color-mix(in srgb, ${text} 3%, ${appearance.background})`,
    "--chat-hover": `color-mix(in srgb, ${text} 12%, ${appearance.background})`,
    backgroundColor: appearance.background,
    color: text,
  } as CSSProperties
  const [draft, setDraft] = useState("")
  const [references, setReferences] = useState<NovaReference[]>([])
  const [localFiles, setLocalFiles] = useState<LocalAttachment[]>([])

  function submit(value = draft) {
    const objective = value.trim()
    if (busy) return
    if (!objective && localFiles.length === 0) return
    onStart(
      objective || "Please review the attached local files.",
      references,
      localFiles,
    )
    setDraft("")
    setReferences([])
    setLocalFiles([])
  }

  return (
    <div style={theme} className="relative isolate flex h-full min-h-0 flex-col">
      <AsciiBackground color={appearance.ascii} />
      <ChatAppearancePicker appearance={appearance} onChange={update} />
      <div className="pointer-events-none relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center px-5 pb-8 text-center">
        <NovaIcon size="lg" alt="" className="mb-5 size-11" />
        <h1 className="text-[26px] font-normal tracking-[-0.04em] sm:text-[30px]">What should we work on?</h1>
      </div>
      <div className="relative z-[1] mx-auto w-full max-w-[800px] shrink-0 px-4 pb-6 sm:px-8 sm:pb-8">
        <div className="mb-2 flex w-full flex-wrap items-center gap-3 px-2 text-[12px] text-[var(--chat-muted)]">
          <ProjectPicker
            className="[&>button]:text-[var(--chat-muted)] [&>button:hover]:bg-[var(--chat-hover)] [&>button:hover]:text-[var(--chat-text)]"
            value={localProject}
            disabled={busy}
            onChange={(selection) => onProjectChange?.(selection)}
            onManageProjects={onManageProjects}
          />
          {workspaceControls ?? <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)]"
          >
            <Cloud className="size-3.5" strokeWidth={1.75} />
            Web harness
            <ChevronDown className="size-3 opacity-70" />
          </button>}
        </div>

        <div className="w-full">
          <Composer
            value={draft}
            onChange={setDraft}
            references={references}
            onReferencesChange={setReferences}
            localFiles={localFiles}
            onLocalFilesChange={setLocalFiles}
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
            placeholder={
              localProject
                ? `Work on ${localProject.displayName}…`
                : "Select a project above, then ask Nova to make changes"
            }
          />
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                disabled={busy}
                onClick={() => submit(starter)}
                className="rounded-md px-1 py-1 text-[11px] text-[var(--chat-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)] focus-visible:outline-2 focus-visible:outline-current disabled:opacity-50"
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
