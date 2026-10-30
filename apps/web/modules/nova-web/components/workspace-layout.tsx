"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { useDefaultLayout } from "react-resizable-panels"

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"

const storage = {
  getItem(key: string) {
    try { return typeof window === "undefined" ? null : localStorage.getItem(key) }
    catch { return null }
  },
  setItem(key: string, value: string) {
    try { localStorage.setItem(key, value) } catch { /* Optional preference. */ }
  },
}

function subscribe(callback: () => void) {
  const media = window.matchMedia("(min-width: 1024px)")
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

export function WorkspaceLayout({ children, open, renderWorkspace }: {
  children: ReactNode
  open: boolean
  renderWorkspace: (expanded: boolean, toggleExpanded: () => void) => ReactNode
}) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia("(min-width: 1024px)").matches, () => false)
  const [expanded, setExpanded] = useState(false)
  const { defaultLayout, onLayoutChange } = useDefaultLayout({ id: "nova:workspace-split:v1", storage })
  const workspace = open ? renderWorkspace(expanded, () => setExpanded((value) => !value)) : null

  if (!desktop || !open || expanded) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {workspace ? (
          <div className="absolute inset-0 z-20 bg-[#101010]" role="region" aria-label="Workspace">
            {workspace}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <ResizablePanelGroup orientation="horizontal" defaultLayout={defaultLayout} onLayoutChange={onLayoutChange} className="min-h-0 flex-1">
      <ResizablePanel id="conversation" defaultSize="60%" minSize="380px">
        <div className="flex h-full min-h-0 flex-col">{children}</div>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize workspace" className="z-10 w-1 bg-white/[0.04] transition-colors hover:bg-white/20 focus-visible:bg-white/20" />
      <ResizablePanel id="workspace" defaultSize="40%" minSize="300px">
        {workspace}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
