"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderOpen,
  Github,
  Loader2,
  Search,
  Settings2,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { getConnectedRepos } from "@/modules/dashboard/actions/analytics"
import {
  createLocalProjectFromGithub,
  listLocalProjects,
  type LocalProjectDto,
} from "@/modules/nova-web/api"
import {
  getLocalWorkspace,
  localWorkspaceSupportsPicker,
  pickLocalWorkspaceFolder,
  restoreLocalWorkspace,
  type LocalWorkspaceState,
} from "@/modules/nova-web/local-workspace"

export type ProjectSelection =
  | { kind: "local"; project: LocalProjectDto; workspace?: LocalWorkspaceState | null }
  | { kind: "github"; project: LocalProjectDto }
  | { kind: "none" }

type Panel = "main" | "github" | "mac"

function projectIcon(project: LocalProjectDto) {
  return project.repositoryFullName ? FolderGit2 : Folder
}

function projectSubline(project: LocalProjectDto) {
  if (project.repositoryFullName) return project.repositoryFullName
  return `${project.rootName} · ${project.fileCount} files`
}

export function ProjectPicker({
  value,
  onChange,
  onManageProjects,
  disabled = false,
  className,
}: {
  value?: LocalProjectDto | null
  onChange: (selection: ProjectSelection) => void
  onManageProjects?: () => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>("main")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<LocalProjectDto[]>([])
  const [repos, setRepos] = useState<Array<{ owner: string; name: string; fullName: string }>>([])
  const [loadingLists, setLoadingLists] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const label = value?.displayName || getLocalWorkspace()?.displayName || "No project"
  const canOpenFolder = localWorkspaceSupportsPicker()

  const refreshLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const [projectsRes, repoList] = await Promise.all([
        listLocalProjects().catch(() => ({ projects: [] as LocalProjectDto[] })),
        getConnectedRepos().catch(() => [] as Array<{ owner: string; name: string; fullName: string }>),
      ])
      setSaved(projectsRes.projects)
      setRepos(repoList)
    } finally {
      setLoadingLists(false)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setPanel("main")
      setQuery("")
      setError(null)
      return
    }
    void refreshLists()
    const id = window.setTimeout(() => searchRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open, refreshLists])

  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (panel !== "main") setPanel("main")
        else setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, panel])

  const filteredSaved = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return saved
    return saved.filter((project) =>
      `${project.displayName} ${project.rootName} ${project.repositoryFullName ?? ""}`
        .toLowerCase()
        .includes(q),
    )
  }, [query, saved])

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repos
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(q))
  }, [query, repos])

  async function openFolder() {
    if (disabled || busy || !canOpenFolder) return
    setBusy(true)
    setError(null)
    try {
      const workspace = await pickLocalWorkspaceFolder()
      if (!workspace) return
      const projectId = workspace.projectId || `local-${workspace.rootName}`
      onChange({
        kind: "local",
        workspace,
        project: {
          id: projectId,
          displayName: workspace.displayName,
          rootName: workspace.rootName,
          fileCount: workspace.entries.length,
          truncated: workspace.truncated,
          repositoryFullName: null,
          status: "active",
          lastUsedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          paths: workspace.entries.map((entry) => entry.path),
        },
      })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open folder")
    } finally {
      setBusy(false)
    }
  }

  async function selectSaved(project: LocalProjectDto) {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      let workspace: LocalWorkspaceState | null = null
      if (!project.repositoryFullName) {
        workspace = await restoreLocalWorkspace(project.id).catch(() => null)
      }
      onChange({
        kind: project.repositoryFullName ? "github" : "local",
        project: workspace
          ? {
              ...project,
              fileCount: workspace.entries.length || project.fileCount,
              paths: workspace.entries.map((entry) => entry.path),
            }
          : project,
        workspace,
      })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open project")
    } finally {
      setBusy(false)
    }
  }

  async function selectGithub(fullName: string) {
    if (disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const { project } = await createLocalProjectFromGithub(fullName)
      onChange({ kind: "github", project })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not index GitHub repository")
    } finally {
      setBusy(false)
    }
  }

  function clearProject() {
    onChange({ kind: "none" })
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex max-w-[260px] items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition",
          open ? "bg-white/[0.06] text-[#d6d6d6]" : "text-[#8a8a8a] hover:bg-white/[0.04] hover:text-[#c8c8c8]",
          (disabled || busy) && "opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : value?.repositoryFullName ? (
          <FolderGit2 className="size-3.5 shrink-0" strokeWidth={1.75} />
        ) : value ? (
          <Folder className="size-3.5 shrink-0" strokeWidth={1.75} />
        ) : (
          <FolderOpen className="size-3.5 shrink-0" strokeWidth={1.75} />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown className={cn("size-3 shrink-0 opacity-70 transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-white/[0.1] bg-[#1c1c1c] shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        >
          {/* Search */}
          <div className="border-b border-white/[0.06] px-2.5 py-2">
            <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-2 py-1.5">
              {panel !== "main" ? (
                <button
                  type="button"
                  aria-label="Back"
                  onClick={() => {
                    setPanel("main")
                    setQuery("")
                  }}
                  className="text-[#8a8a8a] hover:text-white"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              ) : (
                <Search className="size-3.5 shrink-0 text-[#5c5c5c]" />
              )}
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={panel === "github" ? "Search repositories" : panel === "mac" ? "Search folders" : "Search projects"}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[#e8e8e8] outline-none placeholder:text-[#5c5c5c]"
              />
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto py-1">
            {panel === "main" ? (
              <>
                {/* Recent */}
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                  Recent
                </p>
                {loadingLists && filteredSaved.length === 0 ? (
                  <p className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#6b6b6b]">
                    <Loader2 className="size-3 animate-spin" /> Loading…
                  </p>
                ) : null}
                {filteredSaved.map((project) => {
                  const active = value?.id === project.id
                  const Icon = projectIcon(project)
                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => void selectSaved(project)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-50",
                        active && "bg-white/[0.03]",
                      )}
                    >
                      <Icon className="size-3.5 shrink-0 text-[#8a8a8a]" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[#e8e8e8]">{project.displayName}</span>
                      {active ? <Check className="size-3.5 shrink-0 text-[#a0a0a0]" /> : null}
                    </button>
                  )
                })}
                {!loadingLists && filteredSaved.length === 0 ? (
                  <p className="px-3 py-2 text-[12px] text-[#5c5c5c]">No recent projects yet.</p>
                ) : null}

                <button
                  type="button"
                  role="menuitem"
                  onClick={clearProject}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05]",
                    !value && "bg-white/[0.03]",
                  )}
                >
                  <Folder className="size-3.5 shrink-0 text-[#6b6b6b]" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-[13px] text-[#d0d0d0]">No project</span>
                  <span className="text-[11px] text-[#5c5c5c]">This Mac</span>
                </button>

                {/* New project */}
                <p className="mt-1 border-t border-white/[0.06] px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                  New project
                </p>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setQuery("")
                    setPanel("github")
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <Github className="size-3.5 shrink-0 text-[#8a8a8a]" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-[13px] text-[#e8e8e8]">From GitHub</span>
                  <span className="text-[11px] text-[#5c5c5c]">
                    {repos.length} repo{repos.length === 1 ? "" : "s"}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0 text-[#5c5c5c]" />
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy || !canOpenFolder}
                  onClick={() => {
                    if (canOpenFolder) void openFolder()
                    else setPanel("mac")
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-50"
                >
                  <FolderOpen className="size-3.5 shrink-0 text-[#8a8a8a]" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 text-[13px] text-[#e8e8e8]">From this Mac</span>
                  <span className="text-[11px] text-[#5c5c5c]">
                    {canOpenFolder ? "Browse" : "Unsupported"}
                  </span>
                  {canOpenFolder ? null : <ChevronRight className="size-3.5 shrink-0 text-[#5c5c5c]" />}
                </button>

                {/* Manage */}
                <div className="mt-1 border-t border-white/[0.06] pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      onManageProjects?.()
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05]"
                  >
                    <Settings2 className="size-3.5 shrink-0 text-[#8a8a8a]" strokeWidth={1.75} />
                    <span className="text-[13px] text-[#d0d0d0]">Manage projects</span>
                  </button>
                </div>
              </>
            ) : null}

            {panel === "github" ? (
              <>
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#5c5c5c]">
                  Sources
                </p>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 bg-white/[0.04] px-3 py-2 text-left"
                >
                  <Github className="size-3.5 shrink-0 text-[#a0a0a0]" />
                  <span className="min-w-0 flex-1 text-[13px] text-[#e8e8e8]">GitHub repository</span>
                  <span className="text-[11px] text-[#6b6b6b]">
                    {repos[0]?.owner ? `${repos[0].owner} · ` : ""}
                    {repos.length} repo{repos.length === 1 ? "" : "s"}
                  </span>
                </button>
                {loadingLists ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-[12px] text-[#6b6b6b]">
                    <Loader2 className="size-3 animate-spin" /> Loading repositories…
                  </p>
                ) : filteredRepos.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] leading-4 text-[#6b6b6b]">
                    No connected repositories. Connect GitHub in Settings, then try again.
                  </p>
                ) : (
                  filteredRepos.map((repo) => (
                    <button
                      key={repo.fullName}
                      type="button"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => void selectGithub(repo.fullName)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-white/[0.05] disabled:opacity-50"
                    >
                      <FolderGit2 className="size-3.5 shrink-0 text-[#7a7a7a]" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[#e0e0e0]">{repo.fullName}</span>
                    </button>
                  ))
                )}
                {canOpenFolder ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={() => void openFolder()}
                    className="mt-1 flex w-full items-center gap-2.5 border-t border-white/[0.06] px-3 py-2 text-left transition hover:bg-white/[0.05]"
                  >
                    <FolderOpen className="size-3.5 shrink-0 text-[#8a8a8a]" />
                    <span className="min-w-0 flex-1 text-[13px] text-[#e8e8e8]">Open a folder</span>
                    <span className="text-[11px] text-[#5c5c5c]">Browse this Mac</span>
                  </button>
                ) : null}
              </>
            ) : null}

            {panel === "mac" ? (
              <div className="px-3 py-4 text-[12.5px] leading-5 text-[#8a8a8a]">
                This browser can’t grant folder access. Use Chrome or Edge, or create a project from GitHub instead.
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] leading-4 text-amber-200/90">{error}</p>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-white/[0.06] px-3 py-1.5 text-[10px] text-[#4a4a4a]">
            <span>↵ Open</span>
            <span>Esc Close</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
