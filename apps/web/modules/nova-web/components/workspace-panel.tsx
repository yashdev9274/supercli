"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Diff,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  Globe,
  LayoutDashboard,
  ListTodo,
  Loader2,
  Plus,
  Settings2,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { LocalProjectDto } from "@/modules/nova-web/api"
import { languageFromPath, type WorkingStep } from "@/modules/nova-web/working-steps"
import {
  getLocalWorkspace,
  readLocalWorkspaceFile,
} from "@/modules/nova-web/local-workspace"
import type { LocalAttachment } from "@/modules/nova/attachments/contracts"
import type { SessionDetail, TimelineEntry } from "@/modules/nova-web/types"
import { sessionUiLabel } from "@/modules/nova-web/types"

type PanelTab =
  | { id: "overview"; kind: "overview"; title: string }
  | { id: "files"; kind: "files"; title: string }
  | { id: "diffs"; kind: "diffs"; title: string }
  | { id: "setup"; kind: "setup"; title: string }
  | { id: "browser"; kind: "browser"; title: string }
  | { id: string; kind: "file"; title: string; path: string }

type OverviewTodo = {
  id: string
  content: string
  status: "pending" | "in_progress" | "completed"
}

type OverviewTask = {
  id: string
  title: string
  status: "working" | "done" | "failed" | "idle"
  detail?: string
}

function langTone(lang: string) {
  const l = lang.toLowerCase()
  if (l === "tsx" || l === "jsx") return "bg-[#f472b6]/15 text-[#f9a8d4]"
  if (l === "ts" || l === "js") return "bg-[#2dd4bf]/15 text-[#5eead4]"
  if (l === "css") return "bg-sky-400/15 text-sky-300"
  if (l === "json") return "bg-amber-400/15 text-amber-200"
  if (l === "prisma") return "bg-violet-400/15 text-violet-200"
  if (l === "md") return "bg-white/[0.06] text-[#b0b0b0]"
  return "bg-white/[0.06] text-[#b0b0b0]"
}

function FileBadge({ path }: { path: string }) {
  const lang = languageFromPath(path)
  const name = path.split("/").pop() || path
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={cn("shrink-0 rounded px-1 py-px font-mono text-[10px] font-medium leading-4", langTone(lang))}>
        {lang}
      </span>
      <span className="truncate">{name}</span>
    </span>
  )
}

function buildTodos(steps: WorkingStep[], streaming: boolean): OverviewTodo[] {
  if (steps.length === 0 && streaming) {
    return [{ id: "start", content: "Start turn", status: "in_progress" }]
  }
  return steps.map((step, index) => {
    let content = step.label
    if (step.kind === "write" && step.meta?.path) content = `Update ${step.meta.path}`
    if (step.kind === "read" && step.meta?.path) content = `Read ${step.meta.path}`
    if (step.kind === "explore") content = step.label
    if (step.kind === "thinking") content = step.status === "active" ? "Think through the approach" : "Finish reasoning"
    return {
      id: step.id || `todo-${index}`,
      content,
      status: step.status === "active" ? "in_progress" : "completed",
    }
  })
}

function buildTasks(
  steps: WorkingStep[],
  timeline: TimelineEntry[],
  streaming: boolean,
): OverviewTask[] {
  const fromSteps: OverviewTask[] = steps
    .filter((step) => step.kind === "explore" || step.kind === "tool" || step.kind === "write" || step.kind === "read")
    .map((step) => ({
      id: `step-${step.id}`,
      title: step.kind === "write"
        ? `Edit ${step.meta?.path?.split("/").pop() || "file"}`
        : step.kind === "read"
          ? `Read ${step.meta?.path?.split("/").pop() || "file"}`
          : step.label,
      status: step.status === "active" ? "working" : "done",
      detail: step.meta?.path,
    }))

  const fromTimeline: OverviewTask[] = timeline
    .flatMap((entry) => {
      if (entry.kind !== "activity") return []
      if (entry.type !== "action" && entry.type !== "result" && entry.type !== "plan") return []
      return [{
        id: `act-${entry.id}`,
        title: entry.title || entry.type,
        status: (entry.status === "failed"
          ? "failed"
          : entry.status === "working"
            ? "working"
            : "done") as OverviewTask["status"],
        detail: entry.body ?? undefined,
      }]
    })
    .slice(-8)

  const merged = [...fromTimeline, ...fromSteps]
  if (streaming && merged.every((task) => task.status !== "working")) {
    merged.push({
      id: "live-turn",
      title: "Nova turn",
      status: "working",
      detail: "In progress",
    })
  }
  return merged.slice(-12)
}

function collectTouchedPaths(
  steps: WorkingStep[],
  localFiles: LocalAttachment[],
  localProject: LocalProjectDto | null | undefined,
): string[] {
  const paths: string[] = []
  const push = (path?: string | null) => {
    if (!path) return
    if (!paths.includes(path)) paths.push(path)
  }
  for (const step of steps) {
    push(step.meta?.path)
    for (const child of step.children ?? []) push(child.path)
  }
  for (const file of localFiles) push(file.name)
  // Prefer project-relative paths that look like source files recently attached
  if (localProject?.paths) {
    for (const name of localFiles.map((f) => f.name)) {
      const match = localProject.paths.find((p) => p === name || p.endsWith(`/${name}`) || p.split("/").pop() === name)
      if (match) push(match)
    }
  }
  return paths.slice(0, 24)
}

type TreeNode = {
  name: string
  path: string
  kind: "dir" | "file"
  children?: TreeNode[]
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const path of paths) {
    const parts = path.split("/").filter(Boolean)
    let level = root
    let acc = ""
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]!
      acc = acc ? `${acc}/${part}` : part
      const isFile = i === parts.length - 1
      let node = level.find((item) => item.name === part && item.kind === (isFile ? "file" : "dir"))
      if (!node) {
        node = { name: part, path: acc, kind: isFile ? "file" : "dir", children: isFile ? undefined : [] }
        level.push(node)
      }
      if (!isFile) level = node.children!
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) if (node.children) sortNodes(node.children)
  }
  sortNodes(root)
  return root
}

function TreeView({
  nodes,
  depth = 0,
  onOpen,
  activePath,
}: {
  nodes: TreeNode[]
  depth?: number
  onOpen: (path: string) => void
  activePath?: string | null
}) {
  return (
    <ul className={cn(depth === 0 ? "space-y-0.5" : "ml-3 space-y-0.5 border-l border-white/[0.05] pl-2")}>
      {nodes.map((node) => (
        <TreeRow key={node.path} node={node} depth={depth} onOpen={onOpen} activePath={activePath} />
      ))}
    </ul>
  )
}

function TreeRow({
  node,
  depth,
  onOpen,
  activePath,
}: {
  node: TreeNode
  depth: number
  onOpen: (path: string) => void
  activePath?: string | null
}) {
  const [open, setOpen] = useState(depth < 1)
  if (node.kind === "dir") {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12.5px] text-[#a8a8a8] transition hover:bg-white/[0.04] hover:text-[#e8e8e8]"
        >
          {open ? <ChevronDown className="size-3 opacity-70" /> : <ChevronRight className="size-3 opacity-70" />}
          {open ? <FolderOpen className="size-3.5 text-[#8a8a8a]" /> : <Folder className="size-3.5 text-[#8a8a8a]" />}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children?.length ? (
          <TreeView nodes={node.children} depth={depth + 1} onOpen={onOpen} activePath={activePath} />
        ) : null}
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(node.path)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12.5px] transition",
          activePath === node.path
            ? "bg-white/[0.06] text-[#e8e8e8]"
            : "text-[#9a9a9a] hover:bg-white/[0.04] hover:text-[#e0e0e0]",
        )}
      >
        <span className="w-3" />
        <FileCode2 className="size-3.5 shrink-0 text-[#6b6b6b]" />
        <FileBadge path={node.path} />
      </button>
    </li>
  )
}

function OverviewPane({
  session,
  todos,
  tasks,
  touchedPaths,
  localProject,
  streaming,
  onOpenPath,
}: {
  session: SessionDetail
  todos: OverviewTodo[]
  tasks: OverviewTask[]
  touchedPaths: string[]
  localProject?: LocalProjectDto | null
  streaming: boolean
  onOpenPath: (path: string) => void
}) {
  const done = todos.filter((t) => t.status === "completed").length
  const total = todos.length
  const [todosOpen, setTodosOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)

  return (
    <div className="space-y-5 p-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#4a4a4a]">Thread</p>
        <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-[#d0d0d0]">{session.objective}</p>
        <p className="mt-1.5 text-[12px] text-[#6b6b6b]">
          {streaming ? "Working" : sessionUiLabel(session.activeRunId ? "working" : session.status)}
          {localProject ? ` · ${localProject.displayName}` : ""}
        </p>
      </div>

      <section>
        <button
          type="button"
          onClick={() => setTodosOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium text-[#c8c8c8]"
        >
          {todosOpen ? <ChevronDown className="size-3.5 opacity-70" /> : <ChevronRight className="size-3.5 opacity-70" />}
          <ListTodo className="size-3.5 text-[#8a8a8a]" />
          Todos
          <span className="ml-auto text-[11px] font-normal text-[#5c5c5c]">
            {total > 0 ? `${done}/${total}` : "—"}
          </span>
        </button>
        {todosOpen ? (
          <ul className="mt-2 space-y-1">
            {todos.length === 0 ? (
              <li className="px-1 py-2 text-[12px] text-[#4a4a4a]">No todos yet for this turn.</li>
            ) : (
              todos.map((todo) => (
                <li
                  key={todo.id}
                  className="flex items-start gap-2 rounded-md px-1 py-1 text-[12.5px] leading-5 text-[#a8a8a8]"
                >
                  {todo.status === "completed" ? (
                    <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400/90" />
                  ) : todo.status === "in_progress" ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-[#2dd4bf]" />
                  ) : (
                    <Circle className="mt-0.5 size-3.5 shrink-0 text-[#3d3d3d]" />
                  )}
                  <span className={cn(todo.status === "completed" && "text-[#6b6b6b] line-through decoration-[#3d3d3d]")}>
                    {todo.content}
                  </span>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>

      <section>
        <button
          type="button"
          onClick={() => setTasksOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium text-[#c8c8c8]"
        >
          {tasksOpen ? <ChevronDown className="size-3.5 opacity-70" /> : <ChevronRight className="size-3.5 opacity-70" />}
          Tasks
          <span className="ml-auto text-[11px] font-normal text-[#5c5c5c]">{tasks.length || "—"}</span>
        </button>
        {tasksOpen ? (
          <ul className="mt-2 space-y-1">
            {tasks.length === 0 ? (
              <li className="px-1 py-2 text-[12px] text-[#4a4a4a]">No tasks yet.</li>
            ) : (
              tasks.map((task) => (
                <li key={task.id} className="rounded-md px-1.5 py-1.5 hover:bg-white/[0.03]">
                  <div className="flex items-center gap-2 text-[12.5px] text-[#c8c8c8]">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        task.status === "working" && "bg-emerald-400",
                        task.status === "done" && "bg-[#3d3d3d]",
                        task.status === "failed" && "bg-red-400",
                        task.status === "idle" && "bg-[#2a2a2a]",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <span className="text-[10px] uppercase tracking-[0.06em] text-[#4a4a4a]">{task.status}</span>
                  </div>
                  {task.detail ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (task.detail && (task.detail.includes("/") || task.detail.includes("."))) {
                          onOpenPath(task.detail)
                        }
                      }}
                      className="mt-0.5 block max-w-full truncate pl-3.5 text-left font-mono text-[11px] text-[#5c5c5c] hover:text-[#2dd4bf]"
                    >
                      {task.detail}
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>

      <section>
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-[#c8c8c8]">
          <FileIcon className="size-3.5 text-[#8a8a8a]" />
          Files in play
        </p>
        {touchedPaths.length === 0 ? (
          <p className="px-1 text-[12px] text-[#4a4a4a]">No files touched this turn yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {touchedPaths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onOpenPath(path)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[12.5px] text-[#a8a8a8] transition hover:bg-white/[0.04] hover:text-[#e8e8e8]"
                >
                  <FileBadge path={path} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FilesPane({
  localProject,
  onOpenPath,
  activePath,
}: {
  localProject?: LocalProjectDto | null
  onOpenPath: (path: string) => void
  activePath?: string | null
}) {
  const [query, setQuery] = useState("")
  const paths = localProject?.paths ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return paths
    return paths.filter((path) => path.toLowerCase().includes(q))
  }, [paths, query])
  const tree = useMemo(() => buildTree(filtered.slice(0, 800)), [filtered])

  if (!localProject) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <FolderOpen className="size-8 text-[#3d3d3d]" />
        <p className="text-[13px] text-[#8a8a8a]">No local project linked</p>
        <p className="text-[12px] leading-5 text-[#4a4a4a]">
          Open a folder from @ Files to browse and open project files here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-white/[0.05] px-3 py-2">
        <p className="truncate text-[12px] font-medium text-[#c8c8c8]">{localProject.displayName}</p>
        <p className="text-[11px] text-[#5c5c5c]">
          {localProject.fileCount} files{localProject.truncated ? " · partial" : ""}
        </p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files"
          className="mt-2 w-full rounded-md border border-white/[0.08] bg-[#141414] px-2.5 py-1.5 text-[12.5px] text-[#e8e8e8] outline-none placeholder:text-[#4a4a4a] focus:border-[#2dd4bf]/40"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tree.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-[#4a4a4a]">No files match.</p>
        ) : (
          <TreeView nodes={tree} onOpen={onOpenPath} activePath={activePath} />
        )}
      </div>
    </div>
  )
}

function FileViewerPane({
  path,
  content,
  loading,
  error,
}: {
  path: string
  content: string | null
  loading: boolean
  error: string | null
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.05] px-3 py-2">
        <FileBadge path={path} />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#5c5c5c]">{path}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-[#6b6b6b]">
            <Loader2 className="size-3.5 animate-spin" /> Reading…
          </p>
        ) : error ? (
          <p className="px-4 py-6 text-[12.5px] leading-5 text-amber-200/90">{error}</p>
        ) : content == null ? (
          <p className="px-4 py-6 text-[12.5px] text-[#4a4a4a]">No content</p>
        ) : (
          <pre className="whitespace-pre p-3 font-mono text-[11.5px] leading-5 text-[#c8c8c8]">
            {content.split("\n").map((line, index) => (
              <div key={index} className="flex gap-3">
                <span className="w-8 shrink-0 select-none text-right text-[#3d3d3d]">{index + 1}</span>
                <span className="min-w-0 flex-1">{line || " "}</span>
              </div>
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

function PlaceholderPane({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[13px] font-medium text-[#a0a0a0]">{title}</p>
      <p className="max-w-[240px] text-[12px] leading-5 text-[#4a4a4a]">{body}</p>
    </div>
  )
}

export function WorkspacePanel({
  session,
  timeline,
  workingSteps,
  streaming,
  localProject,
  localFiles = [],
  className,
}: {
  session: SessionDetail
  timeline: TimelineEntry[]
  workingSteps: WorkingStep[]
  streaming: boolean
  localProject?: LocalProjectDto | null
  localFiles?: LocalAttachment[]
  className?: string
}) {
  const [tabs, setTabs] = useState<PanelTab[]>([
    { id: "overview", kind: "overview", title: "Overview" },
  ])
  const [activeId, setActiveId] = useState("overview")
  const [menuOpen, setMenuOpen] = useState(false)
  const [fileBodies, setFileBodies] = useState<Record<string, { content: string | null; loading: boolean; error: string | null }>>({})

  const todos = useMemo(() => buildTodos(workingSteps, streaming), [workingSteps, streaming])
  const tasks = useMemo(() => buildTasks(workingSteps, timeline, streaming), [workingSteps, timeline, streaming])
  const touchedPaths = useMemo(
    () => collectTouchedPaths(workingSteps, localFiles, localProject),
    [workingSteps, localFiles, localProject],
  )

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!

  // Auto-open files Nova is actively writing/reading.
  useEffect(() => {
    const hot = workingSteps
      .filter((step) => step.status === "active" && step.meta?.path && (step.kind === "write" || step.kind === "read"))
      .map((step) => step.meta!.path!)
    for (const path of hot.slice(0, 3)) {
      openFileTab(path, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workingSteps])

  function ensureTab(tab: PanelTab, activate = true) {
    setTabs((current) => (current.some((item) => item.id === tab.id) ? current : [...current, tab]))
    if (activate) setActiveId(tab.id)
    setMenuOpen(false)
  }

  function openFileTab(path: string, activate = true) {
    const id = `file:${path}`
    ensureTab({ id, kind: "file", title: path.split("/").pop() || path, path }, activate)
    void loadFileBody(path)
  }

  async function loadFileBody(path: string) {
    setFileBodies((current) => ({
      ...current,
      [path]: { content: current[path]?.content ?? null, loading: true, error: null },
    }))

    // Prefer attached local file content already in memory.
    const attached = localFiles.find((file) => file.name === path || file.name.endsWith(`/${path}`) || path.endsWith(file.name))
    if (attached?.text) {
      setFileBodies((current) => ({
        ...current,
        [path]: { content: attached.text!, loading: false, error: null },
      }))
      return
    }
    if (attached?.dataBase64 && attached.kind === "image") {
      setFileBodies((current) => ({
        ...current,
        [path]: { content: `[image ${attached.mediaType} · ${attached.size} bytes]`, loading: false, error: null },
      }))
      return
    }

    // Local workspace handle
    if (getLocalWorkspace()) {
      const read = await readLocalWorkspaceFile(path)
      if (read.ok) {
        setFileBodies((current) => ({
          ...current,
          [path]: {
            content: read.attachment.text ?? (read.attachment.dataBase64 ? `[binary ${read.attachment.mediaType}]` : ""),
            loading: false,
            error: null,
          },
        }))
        return
      }
      setFileBodies((current) => ({
        ...current,
        [path]: { content: null, loading: false, error: read.error },
      }))
      return
    }

    setFileBodies((current) => ({
      ...current,
      [path]: {
        content: null,
        loading: false,
        error: "Re-open the local project folder to view this file, or attach it from @ Files.",
      },
    }))
  }

  function closeTab(id: string) {
    if (id === "overview") return
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== id)
      if (activeId === id) {
        const index = current.findIndex((tab) => tab.id === id)
        const fallback = next[Math.max(0, index - 1)] ?? next[0]
        if (fallback) setActiveId(fallback.id)
      }
      return next.length ? next : [{ id: "overview", kind: "overview", title: "Overview" }]
    })
  }

  const menuItems: Array<{ id: PanelTab["kind"]; label: string; icon: typeof LayoutDashboard; description: string }> = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, description: "Todos, tasks, files in play" },
    { id: "files", label: "Files", icon: FolderOpen, description: "Browse the local project" },
    { id: "diffs", label: "Diffs", icon: Diff, description: "Changes this turn" },
    { id: "setup", label: "Setup", icon: Settings2, description: "Thread harness settings" },
    { id: "browser", label: "Browser", icon: Globe, description: "Preview surface" },
  ]

  return (
    <aside className={cn("flex h-full min-h-0 w-[320px] shrink-0 flex-col border-l border-white/[0.05] bg-[#0c0c0c]", className)}>
      {/* Tab strip */}
      <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-white/[0.05] px-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {tabs.map((tab) => {
            const active = tab.id === activeId
            return (
              <div
                key={tab.id}
                className={cn(
                  "group flex max-w-[140px] shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] transition",
                  active ? "bg-white/[0.07] text-[#e8e8e8]" : "text-[#7a7a7a] hover:bg-white/[0.04] hover:text-[#c8c8c8]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(tab.id)}
                  className="flex min-w-0 items-center gap-1.5"
                  title={tab.kind === "file" ? tab.path : tab.title}
                >
                  {tab.kind === "overview" ? <LayoutDashboard className="size-3 shrink-0" /> : null}
                  {tab.kind === "files" ? <FolderOpen className="size-3 shrink-0" /> : null}
                  {tab.kind === "file" ? (
                    <span className={cn("rounded px-0.5 font-mono text-[9px]", langTone(languageFromPath(tab.path)))}>
                      {languageFromPath(tab.path)}
                    </span>
                  ) : null}
                  <span className="truncate">{tab.title}</span>
                </button>
                {tab.kind !== "overview" ? (
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={() => closeTab(tab.id)}
                    className="rounded p-0.5 opacity-0 transition hover:bg-white/[0.08] group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Add panel"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-[#7a7a7a] transition hover:bg-white/[0.05] hover:text-[#e8e8e8]",
              menuOpen && "bg-white/[0.06] text-[#e8e8e8]",
            )}
          >
            <Plus className="size-3.5" />
          </button>
          {menuOpen ? (
            <>
              <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[220px] overflow-hidden rounded-xl border border-white/[0.1] bg-[#1a1a1a] p-1 shadow-2xl">
                {menuItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === "overview") ensureTab({ id: "overview", kind: "overview", title: "Overview" })
                        else if (item.id === "files") ensureTab({ id: "files", kind: "files", title: "Files" })
                        else if (item.id === "diffs") ensureTab({ id: "diffs", kind: "diffs", title: "Diffs" })
                        else if (item.id === "setup") ensureTab({ id: "setup", kind: "setup", title: "Setup" })
                        else if (item.id === "browser") ensureTab({ id: "browser", kind: "browser", title: "Browser" })
                      }}
                      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
                    >
                      <Icon className="mt-0.5 size-3.5 shrink-0 text-[#8a8a8a]" />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] text-[#e0e0e0]">{item.label}</span>
                        <span className="block text-[11px] text-[#6b6b6b]">{item.description}</span>
                      </span>
                    </button>
                  )
                })}
                {touchedPaths.length > 0 ? (
                  <div className="mt-1 border-t border-white/[0.07] pt-1">
                    <p className="px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-[#4a4a4a]">Open file</p>
                    {touchedPaths.slice(0, 6).map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => openFileTab(path)}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[#b8b8b8] transition hover:bg-white/[0.05]"
                      >
                        <FileBadge path={path} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab.kind === "overview" ? (
          <div className="h-full overflow-y-auto">
            <OverviewPane
              session={session}
              todos={todos}
              tasks={tasks}
              touchedPaths={touchedPaths}
              localProject={localProject}
              streaming={streaming}
              onOpenPath={(path) => openFileTab(path)}
            />
          </div>
        ) : null}
        {activeTab.kind === "files" ? (
          <FilesPane
            localProject={localProject}
            activePath={null}
            onOpenPath={(path) => openFileTab(path)}
          />
        ) : null}
        {activeTab.kind === "file" ? (
          <FileViewerPane
            path={activeTab.path}
            content={fileBodies[activeTab.path]?.content ?? null}
            loading={Boolean(fileBodies[activeTab.path]?.loading)}
            error={fileBodies[activeTab.path]?.error ?? null}
          />
        ) : null}
        {activeTab.kind === "diffs" ? (
          <PlaceholderPane
            title="Diffs"
            body="File diffs for this turn will show here when Nova records edits against the local project."
          />
        ) : null}
        {activeTab.kind === "setup" ? (
          <PlaceholderPane
            title="Setup"
            body="Thread harness, model, and project binding controls will live here."
          />
        ) : null}
        {activeTab.kind === "browser" ? (
          <PlaceholderPane
            title="Browser"
            body="Preview surfaces and live app windows will open in this panel."
          />
        ) : null}
      </div>
    </aside>
  )
}
