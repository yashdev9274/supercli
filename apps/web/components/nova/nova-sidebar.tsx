"use client"

import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useResizableSidebar } from "@/hooks/use-sidebar-resize"
import { FileCard, type FileCardData } from "./file-card"

export interface NovaSidebarProps {
  files: FileCardData[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title?: string
}

const MIN_WIDTH = 280
const MAX_WIDTH = 640

export function NovaSidebar({ files, open = true, onOpenChange, title = "Session files" }: NovaSidebarProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const { width, setWidth, isResizing, onPointerDown } = useResizableSidebar({
    initialWidth: 384,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: "nova:right-sidebar-width",
  })

  // Clamp to the viewport so a stored width never overflows a small window.
  const safeWidth = typeof window === "undefined" ? width : Math.min(width, window.innerWidth)

  const handleClose = useCallback(() => onOpenChange?.(false), [onOpenChange])

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        setWidth((w) => w - 16)
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        setWidth((w) => w + 16)
      }
    },
    [setWidth]
  )

  // Desktop: inline, resizable panel. Hidden entirely when closed.
  if (isDesktop) {
    if (!open) return null
    return (
      <aside
        className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-background"
        style={{ width: safeWidth }}
        aria-label={title}
        data-resizing={isResizing || undefined}
      >
        {/* Resize handle on the left edge */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={handleResizeKeyDown}
          className={cn(
            "absolute -left-1.5 top-0 z-10 h-full w-3 cursor-col-resize touch-none select-none outline-none",
            "after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:transition-colors",
            isResizing
              ? "after:bg-primary"
              : "after:bg-transparent hover:after:bg-primary/40 focus-visible:after:bg-primary/60"
          )}
        />
        <SidebarHeader title={title} count={files.length} onClose={handleClose} />
        <FileList files={files} isResizing={isResizing} />
      </aside>
    )
  }

  // Mobile / tablet: overlay drawer.
  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
          aria-hidden="true"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: "min(85vw, 400px)" }}
        aria-label={title}
        aria-hidden={!open}
      >
        <SidebarHeader title={title} count={files.length} onClose={handleClose} />
        <FileList files={files} isResizing={false} />
      </aside>
    </>
  )
}

function SidebarHeader({ title, count, onClose }: { title: string; count: number; onClose: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
      <span className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
        {count}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        aria-label={`Close ${title}`}
      >
        <X className="size-4" />
      </button>
    </header>
  )
}

function FileList({ files, isResizing }: { files: FileCardData[]; isResizing: boolean }) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <p className="text-xs leading-relaxed text-muted-foreground/70">No files in this session yet.</p>
      </div>
    )
  }
  return (
    <div
      className={cn(
        "min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3",
        isResizing && "pointer-events-none"
      )}
    >
      {files.map((file) => (
        <FileCard key={file.path} {...file} />
      ))}
    </div>
  )
}
