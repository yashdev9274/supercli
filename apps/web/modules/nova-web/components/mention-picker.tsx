"use client"

import { useEffect, useLayoutEffect, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  Check,
  ChevronRight,
  File,
  GitPullRequest,
  Laptop,
  MessageSquare,
  Search,
  Sparkles,
  Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { NovaReference, ReferenceKind, ReferenceSearchResult } from "@/modules/nova/references/contracts"
import { MAX_REFERENCES, REFERENCE_CATEGORIES } from "@/modules/nova-web/mention-helpers"

const REFERENCE_ICONS = {
  people: Users,
  threads: MessageSquare,
  pull_requests: GitPullRequest,
  skills: Sparkles,
  devices: Laptop,
  files: File,
}

const EMPTY_ITEMS: NovaReference[] = []

type SearchState = {
  key: string
  status: "success" | "error"
  items: NovaReference[]
  message?: string
}

export function useReferenceSearch(kind: ReferenceKind | null, query: string, session: number) {
  const [search, setSearch] = useState<SearchState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify([kind, query, session, attempt])

  useEffect(() => {
    if (!kind) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ kind, q: query })
        const response = await fetch(`/api/nova/references?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        })
        const result: ReferenceSearchResult & { error?: string } = await response.json()
        if (!response.ok) throw new Error(result.error || "Reference search failed")
        if (!Array.isArray(result.items) || result.items.some((item) =>
          !item || item.kind !== kind || typeof item.id !== "string"
          || typeof item.label !== "string" || typeof item.description !== "string",
        )) throw new Error("Invalid reference results")
        if (!controller.signal.aborted) {
          setSearch({ key, status: "success", items: result.items, message: result.message })
        }
      } catch (error) {
        if (!controller.signal.aborted) setSearch({ key, status: "error", items: EMPTY_ITEMS, message: error instanceof Error ? error.message : "Reference search failed" })
      }
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, kind, query])

  const current = search?.key === key ? search : null
  return {
    status: !kind ? "idle" as const : current?.status ?? "loading" as const,
    items: current?.items ?? EMPTY_ITEMS,
    message: current?.message,
    retry: () => setAttempt((value) => value + 1),
  }
}

export function ReferenceIcon({ kind, className }: { kind: ReferenceKind; className?: string }) {
  const Icon = REFERENCE_ICONS[kind]
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", className)} strokeWidth={1.6} />
}

export function mentionOptionId(id: string, index: number): string {
  return `${id}-option-${index}`
}

export function MentionPicker({
  id,
  anchorRef,
  panelRef,
  categories,
  kind,
  query,
  items,
  status,
  message,
  activeIndex,
  references,
  onActiveIndexChange,
  onCategorySelect,
  onReferenceSelect,
  onBack,
  onRetry,
}: {
  id: string
  anchorRef: RefObject<HTMLTextAreaElement | null>
  panelRef: RefObject<HTMLDivElement | null>
  categories: typeof REFERENCE_CATEGORIES
  kind: ReferenceKind | null
  query: string
  items: NovaReference[]
  status: "idle" | "loading" | "success" | "error"
  message?: string
  activeIndex: number
  references: NovaReference[]
  onActiveIndexChange: (index: number) => void
  onCategorySelect: (kind: ReferenceKind) => void
  onReferenceSelect: (reference: NovaReference) => void
  onBack: () => void
  onRetry: () => void
}) {
  const category = REFERENCE_CATEGORIES.find((item) => item.kind === kind)
  const atLimit = references.length >= MAX_REFERENCES

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    function position() {
      if (!anchor || !panel) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(320, window.innerWidth - 16)
      const above = Math.max(0, rect.top - 16)
      const below = Math.max(0, window.innerHeight - rect.bottom - 16)
      const placeAbove = above >= 150 || above >= below
      panel.style.width = `${width}px`
      panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
      panel.style.top = placeAbove ? "auto" : `${Math.max(8, rect.bottom + 8)}px`
      panel.style.bottom = placeAbove ? `${Math.max(8, window.innerHeight - rect.top + 8)}px` : "auto"
      panel.style.maxHeight = `${Math.min(320, placeAbove ? above : below)}px`
      panel.style.visibility = "visible"
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(anchor)
    window.addEventListener("resize", position)
    window.addEventListener("scroll", position, true)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", position)
      window.removeEventListener("scroll", position, true)
    }
  }, [anchorRef, panelRef])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const option = panel?.querySelector<HTMLElement>("[aria-selected='true']")
    if (!panel || !option) return
    const panelRect = panel.getBoundingClientRect()
    const optionRect = option.getBoundingClientRect()
    if (optionRect.top < panelRect.top) panel.scrollTop -= panelRect.top - optionRect.top + 4
    if (optionRect.bottom > panelRect.bottom) panel.scrollTop += optionRect.bottom - panelRect.bottom + 4
  }, [activeIndex, items, categories, panelRef])

  return createPortal(
    <div
      ref={panelRef}
      data-slot="mention-picker"
      onMouseDown={(event) => event.preventDefault()}
      style={{ visibility: "hidden" }}
      className="fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-[#414141] bg-[#222] p-1 text-[#ededed] shadow-[0_12px_32px_rgba(0,0,0,0.4)]"
    >
      {category ? (
        <div className="mb-1 flex items-center gap-2 border-b border-white/[0.07] px-1 pb-2 pt-1">
          <button
            type="button"
            tabIndex={-1}
            onClick={onBack}
            aria-label="Back to reference categories"
            title="Back to categories (Left arrow)"
            className="flex size-6 shrink-0 items-center justify-center rounded text-[#989898] hover:bg-white/[0.06] hover:text-white"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
          </button>
          <ReferenceIcon kind={category.kind} className="text-[#828282]" />
          <span className="text-[13px] font-medium">{category.label}</span>
          <span className="ml-auto truncate pr-1 text-[11px] text-[#929292]">Type to search</span>
        </div>
      ) : null}

      <div id={id} role="listbox" aria-label={category ? `${category.label} references` : "Reference categories"} aria-busy={kind ? status === "loading" : undefined}>
        {!kind ? categories.map((item, index) => (
          <button
            key={item.kind}
            id={mentionOptionId(id, index)}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            onMouseMove={() => onActiveIndexChange(index)}
            onClick={() => onCategorySelect(item.kind)}
            className={cn(
              "flex min-h-10 w-full items-start gap-2 rounded-[5px] px-2 py-1 text-left",
              index === activeIndex && "bg-[#333]",
            )}
          >
            <ReferenceIcon kind={item.kind} className="mt-1 text-[#858585]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] leading-[17px]">{item.label}</span>
              <span className="block text-[12px] leading-[15px] text-[#999]">{item.description}</span>
            </span>
            <ChevronRight aria-hidden="true" className="mt-1.5 size-3 shrink-0 text-[#777]" strokeWidth={1.5} />
          </button>
        )) : status === "success" ? items.map((item, index) => {
          const attached = references.some((reference) => reference.kind === item.kind && reference.id === item.id)
          const unavailable = atLimit && !attached
          return (
            <button
              key={`${item.kind}:${item.id}`}
              id={mentionOptionId(id, index)}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              aria-disabled={unavailable}
              aria-label={`${item.label}${item.description ? `, ${item.description}` : ""}${attached ? ", already attached" : ""}`}
              onMouseMove={() => onActiveIndexChange(index)}
              onClick={() => onReferenceSelect(item)}
              className={cn(
                "flex min-h-10 w-full items-start gap-2 rounded-[5px] px-2 py-1 text-left",
                index === activeIndex && "bg-[#333]",
                unavailable && "opacity-50",
              )}
            >
              <ReferenceIcon kind={item.kind} className="mt-1 text-[#858585]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] leading-[17px]">{item.label}</span>
                {item.description ? <span className="block truncate text-[12px] leading-[15px] text-[#999]">{item.description}</span> : null}
              </span>
              {attached ? <Check aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-[#a3c3bb]" /> : null}
            </button>
          )
        }) : null}
      </div>

      <div role="status" aria-live="polite" className="text-[12px] leading-5 text-[#aaa]">
        {!kind && categories.length === 0 ? (
          <p className="px-3 py-5 text-center">No categories match “{query}”. Try people, threads, pull requests, skills, devices, or files.</p>
        ) : kind && status === "loading" ? (
          <p className="px-3 py-5 text-center">Searching {category?.label.toLowerCase()}…</p>
        ) : kind && status === "error" ? (
          <div className="px-3 py-4 text-center">
            <p>{message || `Couldn’t load ${category?.label.toLowerCase()}. Try again.`}</p>
            <button type="button" tabIndex={-1} onClick={onRetry} className="mt-2 rounded px-2 py-1 text-[#ededed] underline decoration-[#777] underline-offset-4 hover:bg-white/[0.06]">Retry (Enter)</button>
          </div>
        ) : kind && status === "success" && items.length === 0 ? (
          <div className="px-3 py-5 text-center">
            <Search aria-hidden="true" className="mx-auto mb-2 size-4 text-[#777]" />
            <p>{message || (query.trim() ? `No ${category?.label.toLowerCase()} match “${query}”.` : `No ${category?.label.toLowerCase()} available.`)}</p>
          </div>
        ) : kind && message ? <p className="px-2 py-1">{message}</p> : null}
        {atLimit ? <p className="mt-1 border-t border-white/[0.07] px-2 py-2">{MAX_REFERENCES} references attached. Remove one to add more.</p> : null}
      </div>
    </div>,
    document.body,
  )
}
