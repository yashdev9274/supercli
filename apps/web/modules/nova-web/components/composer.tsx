"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUp,
  AtSign,
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Cpu,
  File,
  FileText,
  Image as ImageIcon,
  Plus,
  Search,
  Square,
  X,
  Zap,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { imageDataUrl, type LocalAttachment } from "@/modules/nova/attachments/contracts"
import type { NovaReference, ReferenceKind } from "@/modules/nova/references/contracts"
import {
  filesFromClipboard,
  filesFromDataTransfer,
  mergeLocalAttachments,
  pickLocalFiles,
  readLocalFile,
} from "@/modules/nova-web/local-files"
import {
  isLocalFileReferenceId,
  localPathFromReferenceId,
  pickLocalWorkspaceFolder,
  readLocalWorkspaceFile,
  type LocalWorkspaceState,
} from "@/modules/nova-web/local-workspace"
import {
  addReference,
  filterReferenceCategories,
  insertMentionTrigger,
  moveMentionIndex,
  parseMentionQuery,
  REFERENCE_CATEGORIES,
  replaceMentionQuery,
  type MentionQuery,
} from "@/modules/nova-web/mention-helpers"
import {
  BYOK_PROVIDERS,
  CLOUD_MODELS,
  DEFAULT_NOVA_MODEL,
  DEFAULT_NOVA_PROVIDER,
  HARNESS_PROVIDERS,
  menuId,
  modelChipLabel,
  modelsForProvider,
  NOVA_EFFORTS,
  type HarnessProvider,
  type NovaAgentMode,
  type NovaEffort,
  type NovaModelEntry,
} from "@/modules/nova-web/models"

import { MentionPicker, mentionOptionId, ReferenceIcon, useReferenceSearch } from "./mention-picker"

const EMPTY_REFERENCES: NovaReference[] = []
const EMPTY_LOCAL_FILES: LocalAttachment[] = []

type MentionState = {
  draft: string
  range: MentionQuery
  kind: ReferenceKind | null
  activeIndex: number
  session: number
}

export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  large = false,
  disabled = false,
  streaming = false,
  placeholder,
  className,
  model = DEFAULT_NOVA_MODEL,
  provider = DEFAULT_NOVA_PROVIDER,
  effort = "high",
  mode = "agent",
  onModelChange,
  onEffortChange,
  onModeChange,
  references = EMPTY_REFERENCES,
  onReferencesChange,
  localFiles = EMPTY_LOCAL_FILES,
  onLocalFilesChange,
  onLocalProjectChange,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  large?: boolean
  disabled?: boolean
  streaming?: boolean
  placeholder?: string
  className?: string
  model?: string
  provider?: HarnessProvider
  effort?: NovaEffort
  mode?: NovaAgentMode
  onModelChange?: (selection: { provider: HarnessProvider; model: string }) => void
  onEffortChange?: (effort: NovaEffort) => void
  onModeChange?: (mode: NovaAgentMode) => void
  references?: NovaReference[]
  onReferencesChange?: (references: NovaReference[]) => void
  localFiles?: LocalAttachment[]
  onLocalFilesChange?: (files: LocalAttachment[]) => void
  onLocalProjectChange?: (project: LocalWorkspaceState) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const attachRef = useRef<HTMLButtonElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [localFileBusy, setLocalFileBusy] = useState(false)
  const [localFileError, setLocalFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)
  const sessionRef = useRef(0)
  const pendingCaretRef = useRef<{ value: string; caret: number } | null>(null)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [referenceAnnouncement, setReferenceAnnouncement] = useState("")
  const pickerId = useId()
  const hintId = `${pickerId}-hint`
  const referencesEnabled = !!onReferencesChange && !disabled && !streaming
  const localFilesEnabled = !!onLocalFilesChange && !disabled && !streaming && !localFileBusy
  const attachEnabled = referencesEnabled || localFilesEnabled
  const pickerOpen = referencesEnabled && mention !== null && mention.draft === value
  const categories = filterReferenceCategories(pickerOpen ? mention.range.query : "")
  const search = useReferenceSearch(pickerOpen ? mention.kind : null, pickerOpen ? mention.range.query : "", mention?.session ?? 0)
  const optionCount = pickerOpen && mention.kind ? search.items.length : categories.length
  const activeIndex = Math.max(0, Math.min(mention?.activeIndex ?? 0, optionCount - 1))
  const canSend = (value.trim().length > 0 || localFiles.length > 0) && !disabled && !streaming && !localFileBusy
  const effortMeta = NOVA_EFFORTS.find((item) => item.id === effort) ?? NOVA_EFFORTS[2]!
  const chip = modelChipLabel(provider, model)

  const dismissMention = useCallback(() => setMention(null), [])

  useEffect(() => {
    if (!pickerOpen && !attachMenuOpen) return
    function onPointer(event: PointerEvent) {
      const target = event.target as Node
      if (pickerRef.current?.contains(target) || textareaRef.current?.contains(target) || attachRef.current?.contains(target) || attachMenuRef.current?.contains(target)) return
      dismissMention()
      setAttachMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPointer)
    return () => document.removeEventListener("pointerdown", onPointer)
  }, [attachMenuOpen, dismissMention, pickerOpen])

  useLayoutEffect(() => {
    const pending = pendingCaretRef.current
    const textarea = textareaRef.current
    if (!pending || !textarea || pending.value !== value) return
    pendingCaretRef.current = null
    textarea.focus({ preventScroll: true })
    textarea.setSelectionRange(pending.caret, pending.caret)
  }, [value, mention])

  function syncMention(textarea: HTMLTextAreaElement, userInput: boolean) {
    if (!userInput && pendingCaretRef.current) return
    const draft = textarea.value
    const range = parseMentionQuery(draft, textarea.selectionStart, textarea.selectionEnd)
    if (!referencesEnabled || !range) {
      setMention(null)
      return
    }
    const session = ++sessionRef.current
    setMention((previous) => {
      const current = previous?.draft === value || previous?.draft === draft ? previous : null
      if (!current && !userInput) return null
      const sameTrigger = current?.range.start === range.start
      return {
        draft,
        range,
        kind: sameTrigger ? current.kind : null,
        activeIndex: sameTrigger && current.range.query === range.query ? current.activeIndex : 0,
        session: sameTrigger ? current.session : session,
      }
    })
  }

  function openMention() {
    const textarea = textareaRef.current
    if (!referencesEnabled || !textarea) return
    setAttachMenuOpen(false)
    const range = parseMentionQuery(value, textarea.selectionStart, textarea.selectionEnd)
    const edit = range
      ? { value, caret: textarea.selectionStart }
      : insertMentionTrigger(value, textarea.selectionStart, textarea.selectionEnd)
    const nextRange = range ?? parseMentionQuery(edit.value, edit.caret)
    if (!nextRange) return
    pendingCaretRef.current = edit
    setMention({ draft: edit.value, range: nextRange, kind: null, activeIndex: 0, session: ++sessionRef.current })
    if (edit.value !== value) onChange(edit.value)
  }

  function openAttachMenu() {
    if (!attachEnabled) return
    if (localFilesEnabled && referencesEnabled) {
      setAttachMenuOpen((open) => !open)
      dismissMention()
      return
    }
    if (localFilesEnabled) {
      void handlePickLocalFiles()
      return
    }
    openMention()
  }

  async function ingestLocalFiles(picked: File[], source: "picker" | "paste" | "drop") {
    if (!localFilesEnabled || !onLocalFilesChange || picked.length === 0) return
    setAttachMenuOpen(false)
    setLocalFileError(null)
    setLocalFileBusy(true)
    try {
      const read = await Promise.all(picked.map((file) => readLocalFile(file)))
      const ok = read.flatMap((item) => (item.ok ? [item.attachment] : []))
      const failed = read.flatMap((item) => (item.ok ? [] : [`${item.name}: ${item.error}`]))
      const merged = mergeLocalAttachments(localFiles, ok)
      onLocalFilesChange(merged.attachments)
      const notes = [...failed, ...merged.skipped]
      if (notes.length > 0) setLocalFileError(notes.slice(0, 3).join(" · "))
      const verb = source === "paste" ? "pasted" : source === "drop" ? "dropped" : "attached"
      setReferenceAnnouncement(
        ok.length > 0
          ? `${ok.length} file${ok.length === 1 ? "" : "s"} ${verb}.`
          : "No files attached.",
      )
    } catch (error) {
      setLocalFileError(error instanceof Error ? error.message : "Could not attach files")
    } finally {
      setLocalFileBusy(false)
      textareaRef.current?.focus({ preventScroll: true })
    }
  }

  async function handlePickLocalFiles() {
    if (!localFilesEnabled) return
    try {
      const picked = await pickLocalFiles()
      await ingestLocalFiles(picked, "picker")
    } catch (error) {
      setLocalFileError(error instanceof Error ? error.message : "Could not open the file picker")
    }
  }

  function onComposerDragEnter(event: React.DragEvent) {
    if (!localFilesEnabled) return
    if (![...event.dataTransfer.types].includes("Files")) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  function onComposerDragLeave(event: React.DragEvent) {
    if (!localFilesEnabled) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  function onComposerDragOver(event: React.DragEvent) {
    if (!localFilesEnabled) return
    if (![...event.dataTransfer.types].includes("Files")) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  function onComposerDrop(event: React.DragEvent) {
    if (!localFilesEnabled) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDragOver(false)
    const files = filesFromDataTransfer(event.dataTransfer)
    void ingestLocalFiles(files, "drop")
  }

  function onComposerPaste(event: React.ClipboardEvent) {
    if (!localFilesEnabled) return
    const files = filesFromClipboard(event.clipboardData)
    if (files.length === 0) return
    event.preventDefault()
    void ingestLocalFiles(files, "paste")
  }

  function pickCategory(kind: ReferenceKind | null) {
    if (!pickerOpen || !mention) return
    const edit = replaceMentionQuery(value, mention.range, "@")
    const range = parseMentionQuery(edit.value, edit.caret)
    if (!range) return
    pendingCaretRef.current = edit
    setMention({
      ...mention,
      draft: edit.value,
      range,
      kind,
      activeIndex: kind ? 0 : Math.max(0, REFERENCE_CATEGORIES.findIndex((category) => category.kind === mention.kind)),
    })
    if (edit.value !== value) onChange(edit.value)
  }

  async function pickReference(reference: NovaReference) {
    if (!pickerOpen || !mention) return

    // Local workspace files → attach file contents (browser can't resolve them server-side).
    if (isLocalFileReferenceId(reference.id)) {
      if (!localFilesEnabled || !onLocalFilesChange) return
      const path = localPathFromReferenceId(reference.id)
      if (!path) return
      setLocalFileBusy(true)
      setLocalFileError(null)
      try {
        const read = await readLocalWorkspaceFile(path)
        if (!read.ok) {
          setLocalFileError(`${read.name}: ${read.error}`)
          return
        }
        const merged = mergeLocalAttachments(localFiles, [read.attachment])
        onLocalFilesChange(merged.attachments)
        if (merged.skipped.length) setLocalFileError(merged.skipped.slice(0, 2).join(" · "))
        setReferenceAnnouncement(`${reference.label} attached from local folder.`)
        const edit = replaceMentionQuery(value, mention.range, "")
        pendingCaretRef.current = edit
        dismissMention()
        onChange(edit.value)
      } finally {
        setLocalFileBusy(false)
        textareaRef.current?.focus({ preventScroll: true })
      }
      return
    }

    if (!onReferencesChange) return
    const result = addReference(references, reference)
    if (result.status === "limit") return
    if (result.status === "added") onReferencesChange(result.references)
    setReferenceAnnouncement(`${reference.label} ${result.status === "added" ? "attached" : "is already attached"}.`)
    const edit = replaceMentionQuery(value, mention.range, "")
    pendingCaretRef.current = edit
    dismissMention()
    onChange(edit.value)
  }

  async function handleOpenLocalFolder() {
    if (!localFilesEnabled) return
    setLocalFileBusy(true)
    setLocalFileError(null)
    try {
      const state = await pickLocalWorkspaceFolder()
      if (!state) return
      search.refreshLocalWorkspace()
      onLocalProjectChange?.(state)
      setReferenceAnnouncement(
        state.projectId
          ? `Local project “${state.displayName}” saved · ${state.entries.length} files indexed and searchable.`
          : `Local folder “${state.rootName}” linked · ${state.entries.length} files searchable.`,
      )
    } catch (error) {
      setLocalFileError(error instanceof Error ? error.message : "Could not open local folder")
    } finally {
      setLocalFileBusy(false)
      textareaRef.current?.focus({ preventScroll: true })
    }
  }

  return (
    <div
      onDragEnter={onComposerDragEnter}
      onDragLeave={onComposerDragLeave}
      onDragOver={onComposerDragOver}
      onDrop={onComposerDrop}
      className={cn(
        "relative rounded-2xl border border-white/[0.08] bg-[#1c1c1c] transition",
        dragOver && "border-[#2dd4bf]/55 bg-[#2dd4bf]/[0.04] ring-1 ring-[#2dd4bf]/30",
        className,
      )}
    >
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#0a0a0a]/55 text-[13px] font-medium text-[#d7f5ef]">
          Drop files, photos, or documents
        </div>
      ) : null}
      <div className="px-3.5 pt-3">
        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled || streaming}
          aria-label="Message to Nova"
          role="combobox"
          onPaste={onComposerPaste}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? pickerId : undefined}
          aria-activedescendant={pickerOpen && optionCount > 0 ? mentionOptionId(pickerId, activeIndex) : undefined}
          aria-describedby={referencesEnabled ? hintId : undefined}
          onChange={(event) => {
            onChange(event.target.value)
            syncMention(event.target, true)
          }}
          onSelect={(event) => syncMention(event.currentTarget, false)}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={(event) => {
            composingRef.current = false
            syncMention(event.currentTarget, true)
          }}
          onKeyDown={(event) => {
            if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
            if (pickerOpen && mention) {
              if (event.key === "Escape") {
                event.preventDefault()
                event.stopPropagation()
                dismissMention()
                return
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                setMention({ ...mention, activeIndex: moveMentionIndex(activeIndex, event.key === "ArrowDown" ? 1 : -1, optionCount) })
                return
              }
              if (event.key === "ArrowLeft" && mention.kind) {
                event.preventDefault()
                pickCategory(null)
                return
              }
              if (event.key === "ArrowRight" && !mention.kind) {
                const category = categories[activeIndex]
                if (category) {
                  event.preventDefault()
                  pickCategory(category.kind)
                }
                return
              }
              if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                if (event.key === "Tab" && optionCount === 0) {
                  dismissMention()
                  return
                }
                event.preventDefault()
                if (!mention.kind) {
                  const category = categories[activeIndex]
                  if (category) pickCategory(category.kind)
                } else if (search.status === "error") {
                  search.retry()
                } else {
                  const reference = search.items[activeIndex]
                  if (reference) void pickReference(reference)
                }
                return
              }
              if (event.key === "Tab") dismissMention()
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (canSend) onSubmit()
            }
          }}
          rows={large ? 3 : 2}
          placeholder={placeholder ?? "Ask Nova, paste or drop files, @mention refs"}
          className={cn(
            "w-full resize-none bg-transparent text-[14px] leading-6 text-[#ececec] outline-none placeholder:text-[#5a5a5a] disabled:opacity-60",
            large ? "min-h-[72px]" : "min-h-[48px] max-h-[160px]",
          )}
        />
        <p id={hintId} className="sr-only">
          Paste or drop files, photos, and documents to attach them. Type @ to mention a reference.
          Use Up and Down to navigate, Enter or Tab to select, Right to open a category, Left to go back, and Escape to close.
        </p>
      </div>

      {references.length > 0 || localFiles.length > 0 ? (
        <ul aria-label="Attachments" className="flex flex-wrap gap-1.5 px-3.5 pb-2">
          {localFiles.map((file) => {
            const thumb = imageDataUrl(file)
            const KindIcon = file.kind === "image" ? ImageIcon : file.kind === "document" ? FileText : File
            return (
              <li
                key={file.id}
                title={`${file.name} · ${file.kind} · ${Math.max(1, Math.round(file.size / 1024))}KB`}
                className="flex max-w-full items-center gap-1.5 rounded-md border border-[#2dd4bf]/25 bg-[#2dd4bf]/[0.08] py-0.5 pl-1.5 pr-0.5 text-[12px] text-[#d7f5ef]"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="size-5 shrink-0 rounded object-cover" />
                ) : (
                  <KindIcon className="size-3.5 shrink-0 text-[#2dd4bf]" />
                )}
                <span className="max-w-[180px] truncate">{file.name}</span>
                <button
                  type="button"
                  disabled={!localFilesEnabled}
                  aria-label={`Remove ${file.name}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onLocalFilesChange?.(localFiles.filter((item) => item.id !== file.id))
                    setReferenceAnnouncement(`${file.name} removed.`)
                    textareaRef.current?.focus({ preventScroll: true })
                  }}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-[#8d8d8d] hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2dd4bf] disabled:opacity-40"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            )
          })}
          {references.map((reference) => (
            <li key={`${reference.kind}:${reference.id}`} title={`${reference.label}${reference.description ? ` · ${reference.description}` : ""}`} className="flex max-w-full items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.035] py-0.5 pl-2 pr-0.5 text-[12px] text-[#c5c5c5]">
              <ReferenceIcon kind={reference.kind} className="size-3 text-[#999]" />
              <span className="max-w-[200px] truncate">{reference.label}</span>
              <button
                type="button"
                disabled={!referencesEnabled}
                aria-label={`Remove ${reference.label} reference`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onReferencesChange?.(references.filter((item) => item.kind !== reference.kind || item.id !== reference.id))
                  setReferenceAnnouncement(`${reference.label} removed.`)
                  textareaRef.current?.focus({ preventScroll: true })
                }}
                className="flex size-6 shrink-0 items-center justify-center rounded text-[#8d8d8d] hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-[#2dd4bf] disabled:opacity-40"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {localFileError ? (
        <p className="px-3.5 pb-2 text-[11px] leading-4 text-amber-300/90">{localFileError}</p>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">{referenceAnnouncement}</p>

      <div className="relative flex items-center gap-1.5 px-2.5 pb-2.5">
        <IconBtn
          buttonRef={attachRef}
          label={localFileBusy ? "Reading local files…" : "Attach files or mentions"}
          disabled={!attachEnabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openAttachMenu}
        >
          <Plus className="size-4" strokeWidth={1.75} />
        </IconBtn>
        {attachMenuOpen ? (
          <div
            ref={attachMenuRef}
            role="menu"
            aria-label="Attach"
            className="absolute bottom-[calc(100%+6px)] left-0 z-30 min-w-[200px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1a1a] p-1 shadow-2xl"
          >
            {localFilesEnabled ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handlePickLocalFiles()}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-[#d6d6d6] transition hover:bg-white/[0.05]"
              >
                <File className="size-3.5 text-[#2dd4bf]" />
                Files, photos, documents
              </button>
            ) : null}
            {referencesEnabled ? (
              <button
                type="button"
                role="menuitem"
                onClick={openMention}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-[#d6d6d6] transition hover:bg-white/[0.05]"
              >
                <AtSign className="size-3.5 text-[#999]" />
                Mention @
              </button>
            ) : null}
          </div>
        ) : null}

        <ModelPicker
          provider={provider}
          model={model}
          chip={chip}
          disabled={streaming}
          onChange={onModelChange}
        />

        <EffortPicker
          value={effort}
          label={effortMeta.label}
          disabled={streaming}
          onChange={onEffortChange}
        />

        <div className="ml-auto flex items-center gap-1.5">
          <IconBtn label="Voice">
            <AudioLines className="size-4" strokeWidth={1.75} />
          </IconBtn>
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-8 items-center justify-center rounded-full bg-[#2a2a2a] text-white transition hover:bg-[#333] active:scale-[0.97]"
              aria-label="Stop"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSend}
              onClick={onSubmit}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition active:scale-[0.97]",
                canSend
                  ? "bg-[#2dd4bf] text-[#0a0a0a] hover:bg-[#5eead4]"
                  : "bg-[#2a2a2a] text-[#555]",
              )}
              aria-label="Send"
            >
              <ArrowUp className="size-4" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
      {pickerOpen && mention ? (
        <MentionPicker
          id={pickerId}
          anchorRef={textareaRef}
          panelRef={pickerRef}
          categories={categories}
          kind={mention.kind}
          query={mention.range.query}
          items={search.items}
          status={search.status}
          message={search.message}
          activeIndex={activeIndex}
          references={references}
          onActiveIndexChange={(index) => setMention({ ...mention, activeIndex: index })}
          onCategorySelect={pickCategory}
          onReferenceSelect={(reference) => void pickReference(reference)}
          onBack={() => pickCategory(null)}
          onRetry={search.retry}
          onOpenLocalFolder={localFilesEnabled ? () => void handleOpenLocalFolder() : undefined}
          onAttachLocalFiles={localFilesEnabled ? () => void handlePickLocalFiles() : undefined}
          localFolderBusy={localFileBusy}
        />
      ) : null}
    </div>
  )
}

function IconBtn({ children, label, buttonRef, disabled, onClick, onMouseDown }: {
  children: React.ReactNode
  label: string
  buttonRef?: React.RefObject<HTMLButtonElement | null>
  disabled?: boolean
  onClick?: () => void
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>
}) {
  return (
    <button
      type="button"
      ref={buttonRef}
      disabled={disabled}
      onClick={onClick}
      onMouseDown={onMouseDown}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-lg text-[#6b6b6b] transition hover:bg-white/[0.04] hover:text-[#c8c8c8] focus-visible:outline-2 focus-visible:outline-[#2dd4bf] disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function Pill({ children, open }: { children: React.ReactNode; open?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-[#b8b8b8] transition hover:bg-white/[0.04] hover:text-[#e8e8e8]",
        open && "bg-white/[0.05] text-white",
      )}
    >
      {children}
      <ChevronDown className="size-3 shrink-0 opacity-50" />
    </span>
  )
}

function EffortPicker({
  value,
  label,
  disabled,
  onChange,
}: {
  value: NovaEffort
  label: string
  disabled?: boolean
  onChange?: (effort: NovaEffort) => void
}) {
  const [open, setOpen] = useState(false)
  const [fast, setFast] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className="disabled:opacity-50">
        <Pill open={open}>{label}</Pill>
      </button>
      {open ? (
        <Panel className="left-0 w-48">
          <div className="px-2.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
            Reasoning
          </div>
          {NOVA_EFFORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange?.(item.id)
                setOpen(false)
              }}
              className={cn(
                "flex h-8 w-full items-center px-2.5 text-left text-[13px] text-[#c8c8c8] transition hover:bg-white/[0.05]",
                item.id === value && "text-white",
              )}
            >
              <span className="flex-1">{item.label}</span>
              {item.id === value ? <Check className="size-3.5 text-[#2dd4bf]" /> : null}
            </button>
          ))}
          <div className="my-1 border-t border-white/[0.06]" />
          <div className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
            Modes
          </div>
          <button
            type="button"
            onClick={() => setFast((v) => !v)}
            className="flex h-9 w-full items-center gap-2 px-2.5 text-left text-[13px] text-[#c8c8c8]"
          >
            <Zap className="size-3.5 opacity-70" />
            <span className="flex-1">Fast</span>
            <span
              className={cn(
                "relative h-5 w-9 rounded-full transition",
                fast ? "bg-[#2dd4bf]" : "bg-[#333]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white transition",
                  fast ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>
        </Panel>
      ) : null}
    </div>
  )
}

function ModelPicker({
  provider,
  model,
  chip,
  disabled,
  onChange,
}: {
  provider: HarnessProvider
  model: string
  chip: string
  disabled?: boolean
  onChange?: (selection: { provider: HarnessProvider; model: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeProvider, setActiveProvider] = useState<HarnessProvider | "all">("all")
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => {
    setOpen(false)
    setQuery("")
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list =
      activeProvider === "all"
        ? [...CLOUD_MODELS, ...BYOK_PROVIDERS.flatMap((p) => modelsForProvider(p.id))]
        : activeProvider === "supercode"
          ? CLOUD_MODELS
          : modelsForProvider(activeProvider)
    if (q) {
      list = list.filter(
        (entry) =>
          entry.label.toLowerCase().includes(q)
          || entry.id.toLowerCase().includes(q)
          || entry.desc.toLowerCase().includes(q)
          || entry.provider.includes(q),
      )
    }
    return list
  }, [activeProvider, query])

  function pick(entry: NovaModelEntry) {
    onChange?.({ provider: entry.provider, model: entry.id })
    setOpen(false)
    setQuery("")
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((v) => !v)} className="disabled:opacity-50">
        <Pill open={open}>
          <Cpu className="size-3.5 opacity-80" strokeWidth={1.75} />
          <span className="truncate">{chip}</span>
        </Pill>
      </button>

      {open ? (
        <Panel className="left-0 flex w-[420px] overflow-hidden p-0">
          {/* Provider rail */}
          <div className="w-[148px] shrink-0 border-r border-white/[0.06] bg-[#141414] py-1.5">
            <ProviderRailItem
              active={activeProvider === "all"}
              label="All models"
              onClick={() => setActiveProvider("all")}
            />
            <div className="my-1 border-t border-white/[0.05]" />
            <ProviderRailItem
              active={activeProvider === "supercode"}
              label="Supercode Cloud"
              onClick={() => setActiveProvider("supercode")}
            />
            {BYOK_PROVIDERS.map((item) => (
              <ProviderRailItem
                key={item.id}
                active={activeProvider === item.id}
                label={item.label}
                onClick={() => setActiveProvider(item.id)}
              />
            ))}
          </div>

          {/* Model list */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 items-center gap-2 border-b border-white/[0.06] px-2.5">
              <Search className="size-3.5 text-[#5c5c5c]" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#e8e8e8] outline-none placeholder:text-[#4a4a4a]"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto py-1">
              {activeProvider === "all" || activeProvider === "supercode" ? (
                <>
                  <div className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                    Supercode Cloud
                  </div>
                  {(activeProvider === "supercode" ? CLOUD_MODELS : CLOUD_MODELS.filter((e) =>
                    !query.trim()
                      || e.label.toLowerCase().includes(query.toLowerCase())
                      || e.id.toLowerCase().includes(query.toLowerCase()),
                  )).map((entry) => (
                    <ModelRow
                      key={menuId(entry)}
                      entry={entry}
                      active={provider === entry.provider && model === entry.id}
                      onClick={() => pick(entry)}
                    />
                  ))}
                </>
              ) : null}

              {activeProvider === "all"
                ? BYOK_PROVIDERS.map((prov) => {
                    const models = modelsForProvider(prov.id).filter((e) =>
                      !query.trim()
                        || e.label.toLowerCase().includes(query.toLowerCase())
                        || e.id.toLowerCase().includes(query.toLowerCase())
                        || prov.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    if (models.length === 0) return null
                    return (
                      <div key={prov.id}>
                        <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                          {prov.label}
                        </div>
                        {models.map((entry) => (
                          <ModelRow
                            key={menuId(entry)}
                            entry={entry}
                            active={provider === entry.provider && model === entry.id}
                            onClick={() => pick(entry)}
                          />
                        ))}
                      </div>
                    )
                  })
                : activeProvider !== "supercode"
                  ? filtered.map((entry) => (
                      <ModelRow
                        key={menuId(entry)}
                        entry={entry}
                        active={provider === entry.provider && model === entry.id}
                        onClick={() => pick(entry)}
                      />
                    ))
                  : null}

              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-[#5c5c5c]">No models match</p>
              ) : null}
            </div>
            <div className="border-t border-white/[0.06] px-2.5 py-1.5 text-[10px] text-[#4a4a4a]">
              {HARNESS_PROVIDERS.length} providers · harness `/api/ai/chat`
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

function ProviderRailItem({
  label,
  active,
  onClick,
}: {
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 px-2.5 text-left text-[12px] transition",
        active ? "bg-white/[0.06] text-white" : "text-[#8a8a8a] hover:bg-white/[0.03] hover:text-[#c8c8c8]",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? <ChevronRight className="ml-auto size-3 opacity-50" /> : null}
    </button>
  )
}

function ModelRow({
  entry,
  active,
  onClick,
}: {
  entry: NovaModelEntry
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition hover:bg-white/[0.04]",
        active && "bg-white/[0.05]",
      )}
    >
      <Cpu className="size-3.5 shrink-0 text-[#6b6b6b]" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-[#e4e4e4]">{entry.label}</span>
        <span className="block truncate text-[10px] text-[#5c5c5c]">
          {entry.desc}
          {entry.cost ? ` · ${entry.cost}` : ""}
        </span>
      </span>
      {active ? <Check className="size-3.5 shrink-0 text-[#2dd4bf]" /> : null}
    </button>
  )
}

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "absolute bottom-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1a1a] py-1 shadow-[0_20px_50px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      {children}
    </div>
  )
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss()
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [onDismiss, open, ref])
}
