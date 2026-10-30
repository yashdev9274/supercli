"use client"

import { useEffect, useMemo, useState, type DragEvent } from "react"
import { ArrowDown, ArrowUp, ChevronRight, Folder, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { hasSidebarFilters, isThreadUnread, markThreadsRead, organizeSidebar, removeSidebarFolder, reorderIds, type SidebarPreferences } from "../sidebar-state"
import { statusDot } from "../theme"
import { relativeTime, sessionUiStatus, type AgentSessionSummary } from "../types"
import { sidebarMenuClass, sidebarMenuItemClass } from "./sidebar-options"
import { SidebarMemberAvatar, SidebarOriginIcon, sidebarOriginLabels } from "./sidebar-identity"

const THREAD_TYPE = "application/x-nova-thread"
const GROUP_TYPE = "application/x-nova-group"

export function SidebarFolderDialog({ folder, onClose, onSave }: {
  folder: { id: string | null; name: string } | null
  onClose: () => void
  onSave: (id: string | null, name: string) => void
}) {
  const [name, setName] = useState(folder?.name ?? "")
  return (
    <Dialog open={folder !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="border-white/10 bg-[#202020] text-[#eee] sm:max-w-sm">
        <DialogTitle className="text-base">{folder?.id ? "Rename folder" : "New folder"}</DialogTitle>
        <DialogDescription className="text-xs text-[#999]">Organize your threads. Folders are saved in this browser.</DialogDescription>
        <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSave(folder?.id ?? null, name.trim()) }}>
          <label htmlFor="nova-folder-name" className="mb-2 block text-xs text-[#bbb]">Folder name</label>
          <input id="nova-folder-name" autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. In progress" className="h-9 w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm outline-none focus:border-white/30" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-[#aaa] hover:bg-white/[0.06]">Cancel</button>
            <button type="submit" disabled={!name.trim()} className="rounded-md bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15 disabled:opacity-40">{folder?.id ? "Save" : "Create folder"}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function SidebarThreads({ sessions, query, selectedId, preferences, onChange, onOpen, onRenameFolder, onClear }: {
  sessions: AgentSessionSummary[]
  query: string
  selectedId: string | null
  preferences: SidebarPreferences
  onChange: (update: (current: SidebarPreferences) => SidebarPreferences) => void
  onOpen: (id: string) => void
  onRenameFolder: (id: string, name: string) => void
  onClear: () => void
}) {
  const groups = useMemo(() => organizeSidebar(sessions, query, preferences), [sessions, query, preferences])
  const selected = sessions.find((session) => session.id === selectedId)
  const selectedSequence = selected?.latestSequence
  const selectedRead = selectedId ? preferences.read[selectedId] : undefined
  useEffect(() => {
    if (selectedId && selectedSequence !== undefined && selectedSequence > (selectedRead ?? 0)) {
      onChange((current) => ({ ...current, read: { ...current.read, [selectedId]: selectedSequence } }))
    }
  }, [onChange, selectedId, selectedSequence, selectedRead])

  function moveGroup(source: string, target: string) {
    onChange((current) => ({ ...current, captionOrder: "manual", groupOrder: reorderIds(groups.map((group) => group.id), source, target) }))
  }
  function moveThread(source: string, target: string) {
    onChange((current) => {
      const ordered = organizeSidebar(sessions, "", {
        ...current,
        group: "none",
        folders: [],
        filters: { project: "all", participant: "all", creator: "all", origin: "all" },
      }).flatMap((group) => group.sessions.map((session) => session.id))
      return { ...current, threadOrder: reorderIds(ordered, source, target) }
    })
  }
  function assign(threadId: string, folderId: string | null) {
    onChange((current) => {
      const assignments = { ...current.assignments }
      if (folderId) assignments[threadId] = folderId
      else delete assignments[threadId]
      return { ...current, assignments, collapsed: current.collapsed.filter((id) => id !== `folder:${folderId}`) }
    })
  }
  function drop(event: DragEvent, groupId: string, folder: boolean) {
    event.preventDefault()
    const groupSource = event.dataTransfer.getData(GROUP_TYPE)
    const threadSource = event.dataTransfer.getData(THREAD_TYPE)
    if (groupSource) moveGroup(groupSource, groupId)
    else if (threadSource && folder) assign(threadSource, groupId.slice(7))
    else if (threadSource) assign(threadSource, null)
  }
  return (
    <>
      {hasSidebarFilters(preferences) ? <button type="button" onClick={onClear} className="mx-2 mb-2 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-[#aaa]">Filters active · Clear</button> : null}
      {groups.map((group, groupIndex) => {
        const collapsed = preferences.collapsed.includes(group.id)
        return (
          <div key={group.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, group.id, group.folder)} className="mb-1">
            {group.id !== "all" ? (
              <div className="group/caption flex items-center gap-1 rounded-md px-1 py-1 hover:bg-white/[0.025]">
                <button type="button" draggable={preferences.captionOrder === "manual"} onDragStart={(event) => { event.dataTransfer.setData(GROUP_TYPE, group.id); event.dataTransfer.effectAllowed = "move" }}
                  onKeyDown={(event) => {
                    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
                    event.preventDefault()
                    const target = groups[groupIndex + (event.key === "ArrowUp" ? -1 : 1)]
                    if (target) moveGroup(group.id, target.id)
                  }}
                  onClick={() => onChange((current) => ({ ...current, collapsed: collapsed ? current.collapsed.filter((id) => id !== group.id) : [...current.collapsed, group.id] }))}
                  aria-expanded={!collapsed} title="Alt + Up/Down to reorder" className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] text-[#888] focus-visible:outline focus-visible:outline-white/30">
                  <ChevronRight className={cn("size-3 shrink-0 transition-transform", !collapsed && "rotate-90")} />
                  <Folder className="size-3 shrink-0" /><span className="truncate">{group.name}</span><span className="ml-auto text-[10px] text-[#555]">{group.sessions.length}</span>
                </button>
                {group.folder ? <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" aria-label={`Options for ${group.name}`} className="rounded p-1 text-[#777] opacity-0 hover:text-white focus:opacity-100 group-hover/caption:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="size-3" /></button></DropdownMenuTrigger>
                  <DropdownMenuContent className={sidebarMenuClass} align="start">
                    <DropdownMenuItem className={sidebarMenuItemClass} onSelect={() => onRenameFolder(group.id.slice(7), group.name)}><Pencil />Rename folder</DropdownMenuItem>
                    <DropdownMenuItem className={sidebarMenuItemClass} onSelect={() => onChange((current) => removeSidebarFolder(current, group.id.slice(7)))}><Trash2 />Remove folder</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu> : null}
              </div>
            ) : null}
            {!collapsed ? group.sessions.map((item, index) => {
              const ui = sessionUiStatus(item)
              const unread = item.id !== selectedId && isThreadUnread(item, preferences)
              const code = `NOVA-${Math.max(1, sessions.length - sessions.findIndex((session) => session.id === item.id))}`
              const origin = item.origin ?? item.surfaces[0]?.provider ?? "web"
              const members = [...new Map([...(item.creator ? [item.creator] : []), ...(item.participants ?? [])].map((member) => [member.id, member])).values()]
              return (
                <div key={item.id} className={cn("group/row flex items-start rounded-lg transition", selectedId === item.id ? "bg-white/[0.07]" : "hover:bg-white/[0.035]")}
                  onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                    const source = event.dataTransfer.getData(THREAD_TYPE)
                    if (!source) return
                    event.preventDefault()
                    event.stopPropagation()
                    if (source === item.id) return
                    assign(source, group.folder ? group.id.slice(7) : null)
                    moveThread(source, item.id)
                  }}>
                  <button type="button" draggable onDragStart={(event) => { event.dataTransfer.setData(THREAD_TYPE, item.id); event.dataTransfer.effectAllowed = "move" }}
                    onKeyDown={(event) => {
                      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
                      event.preventDefault()
                      const target = group.sessions[index + (event.key === "ArrowUp" ? -1 : 1)]
                      if (target) moveThread(item.id, target.id)
                    }}
                    onClick={() => { onChange((current) => markThreadsRead(current, [item])); onOpen(item.id) }} title={item.objective}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-white/30">
                    <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", statusDot[ui] ?? statusDot[item.status] ?? "bg-zinc-600")} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-1.5"><p className={cn("min-w-0 flex-1 truncate text-[13px] leading-5", unread ? "font-medium text-[#e8e8e8]" : "text-[#a0a0a0]")}>{item.objective}</p>{unread ? <span aria-label="Unread" className="mt-2 size-1 shrink-0 rounded-full bg-[#2dd4bf]" /> : null}<span className="shrink-0 pt-0.5 font-mono text-[10px] text-[#666]">{relativeTime(item.updatedAt)}</span></div>
                      {preferences.detailed ? (
                        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-[#888]">
                          <span className="shrink-0 text-[#666]">{code}</span>
                          <span title={sidebarOriginLabels[origin]} className="flex shrink-0 items-center gap-1"><SidebarOriginIcon origin={origin} className="size-3" /><span>{sidebarOriginLabels[origin]}</span></span>
                          {members.length > 0 ? <span className="ml-auto flex shrink-0 -space-x-1">{members.slice(0, 3).map((member) => <SidebarMemberAvatar key={member.id} member={member} className="size-4 border border-[#202020] text-[8px]" />)}{members.length > 3 ? <span title={members.slice(3).map((member) => member.name).join(", ")} className="flex size-4 items-center justify-center rounded-full bg-[#424047] text-[8px] text-[#ddd]">+{members.length - 3}</span> : null}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button type="button" aria-label={`Options for ${item.objective}`} className="mr-1 mt-1.5 shrink-0 rounded p-1 text-[#777] opacity-0 hover:text-white focus:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="size-3" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className={sidebarMenuClass}>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className={sidebarMenuItemClass}><Folder />Move to folder</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className={sidebarMenuClass}>
                          <DropdownMenuItem className={sidebarMenuItemClass} onSelect={() => assign(item.id, null)}>No folder</DropdownMenuItem>
                          {preferences.folders.map((folder) => <DropdownMenuItem key={folder.id} className={sidebarMenuItemClass} onSelect={() => assign(item.id, folder.id)}>{folder.name}</DropdownMenuItem>)}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuItem disabled={index === 0} className={sidebarMenuItemClass} onSelect={() => moveThread(item.id, group.sessions[index - 1].id)}><ArrowUp />Move up</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === group.sessions.length - 1} className={sidebarMenuItemClass} onSelect={() => moveThread(item.id, group.sessions[index + 1].id)}><ArrowDown />Move down</DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/[0.08]" />
                      <DropdownMenuItem disabled={item.id === selectedId} className={sidebarMenuItemClass} onSelect={() => onChange((current) => ({ ...current, read: { ...current.read, [item.id]: unread ? item.latestSequence : 0 } }))}>{unread ? "Mark as read" : "Mark as unread"}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            }) : null}
            {!collapsed && group.folder && group.sessions.length === 0 ? <p className="px-6 py-3 text-[11px] text-[#666]">Drag threads here or use a thread’s menu.</p> : null}
          </div>
        )
      })}
      {groups.every((group) => group.sessions.length === 0) ? <p className="px-3 py-6 text-center text-xs text-[#666]">{query || hasSidebarFilters(preferences) ? "No matching threads" : "No threads yet"}</p> : null}
    </>
  )
}
