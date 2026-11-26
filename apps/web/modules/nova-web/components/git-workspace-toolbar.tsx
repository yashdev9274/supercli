"use client"

import { useEffect, useState, type ReactNode } from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Laptop,
  Loader2,
  Search,
} from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type GitBranch as Branch,
  type GitProject,
  type LocalGitWorktree,
} from "../git-workspace"
import type { GitWorkspaceState } from "../use-git-workspace"
import { listGithubProjectBranches } from "../api"
import { matchWorkspaceProject } from "../workspace-discovery"

const row =
  "flex w-full min-w-0 items-center gap-2 rounded px-2 py-2 text-left text-xs text-[#ddd] hover:bg-white/5 disabled:opacity-40"
const trigger =
  "flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs text-[#999] hover:bg-white/5 disabled:opacity-40"
const panel =
  "max-w-[calc(100vw-2rem)] border-white/10 bg-[#252525] p-1 text-[#ddd]"

export function GitWorkspaceToolbar({
  state,
  disabled,
  repositoryFullName,
  onSettings,
  onOpenWorkspace,
  workspaceLabels = {},
  localRootName,
  agentUsage,
}: {
  state: GitWorkspaceState
  disabled: boolean
  repositoryFullName?: string | null
  onSettings: () => void
  onOpenWorkspace?: (threadId: string) => void
  workspaceLabels?: Record<string, string>
  localRootName?: string | null
  agentUsage?: ReactNode
}) {
  const [machineOpen, setMachineOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [existingOpen, setExistingOpen] = useState(false)
  const [projects, setProjects] = useState<GitProject[]>([])
  const [localBranches, setLocalBranches] = useState<Branch[]>([])
  const [githubBranches, setGithubBranches] = useState<Branch[]>([])
  const [githubDefaultBranch, setGithubDefaultBranch] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [existing, setExisting] = useState<LocalGitWorktree[]>([])
  const [loadingWorktrees, setLoadingWorktrees] = useState(false)
  const [query, setQuery] = useState("")
  const [worktreeQuery, setWorktreeQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [branchError, setBranchError] = useState<string | null>(null)
  const { client, choice, workspace, locked } = state
  const projectId = workspace?.projectId ?? choice?.projectId
  const project = matchWorkspaceProject(projects, {
    projectId,
    repositoryFullName,
    rootName: localRootName,
  })
  const githubMode = Boolean(repositoryFullName && !choice && !workspace)
  const branches = githubMode ? githubBranches : localBranches
  const connected = client.connected
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!connected) return
    let current = true
    queueMicrotask(() => {
      if (current) {
        setProjects([])
        setLocalBranches([])
      }
    })
    void client
      .projects()
      .then(async (items) => {
        const selected = matchWorkspaceProject(items, {
          projectId,
          repositoryFullName,
          rootName: localRootName,
        })
        const refs = selected ? await client.branches(selected.id) : []
        if (current) {
          setProjects(items)
          setLocalBranches(refs)
          setError(null)
        }
      })
      .catch((cause) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [
    machineOpen,
    client,
    connected,
    projectId,
    repositoryFullName,
    localRootName,
  ])

  useEffect(() => {
    if (!githubMode || !state.webProjectId) return
    const controller = new AbortController()
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setLoadingBranches(true)
      setGithubBranches([])
      setGithubDefaultBranch(null)
      setBranchError(null)
    })
    void listGithubProjectBranches(state.webProjectId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setGithubBranches(
          data.branches.map((branch) => ({
            name: branch.name,
            sha: branch.sha,
            ref: `refs/heads/${branch.name}`,
            current: branch.isDefault,
            checkedOut: false,
            remote: true,
          })),
        )
      setTruncated(data.truncated)
      setGithubDefaultBranch(data.defaultBranch)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setBranchError(
            cause instanceof Error
              ? cause.message
              : "GitHub branches could not be loaded",
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingBranches(false)
      })
    return () => controller.abort()
  }, [githubMode, state.webProjectId, refreshKey])

  useEffect(() => {
    if (!existingOpen || !connected || !project?.id) return
    let current = true
    queueMicrotask(() => {
      if (current) {
        setLoadingWorktrees(true)
        setExisting([])
        setError(null)
      }
    })
    void client
      .worktrees(project.id)
      .then((items) => {
        if (current) setExisting(items)
      })
      .catch((cause) => {
        if (current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Worktrees could not be loaded",
          )
      })
      .finally(() => {
        if (current) setLoadingWorktrees(false)
      })
    return () => {
      current = false
    }
  }, [existingOpen, project?.id, connected, client])

  function settings() {
    setMachineOpen(false)
    setBranchOpen(false)
    onSettings()
  }

  function select(mode: "worktree" | "current", ref?: string) {
    if (!client.connected || !project) {
      settings()
      return
    }
    state.select({
      projectId: project.id,
      sourceRef:
        mode === "current"
          ? (localBranches.find((branch) => branch.current)?.ref ?? "")
          : (ref ??
            choice?.sourceRef ??
            localBranches.find(
              (branch) =>
                branch.name === state.githubBranch ||
                branch.name === `origin/${state.githubBranch}`,
            )?.ref ??
            localBranches.find((branch) => branch.current)?.ref ??
            localBranches[0]?.ref ??
            ""),
      mode,
      copyIgnored: choice?.copyIgnored ?? false,
      ...(mode === "worktree" && choice?.newBranch
        ? { newBranch: choice.newBranch }
        : {}),
    })
    setMachineOpen(false)
    setBranchOpen(false)
  }

  async function openExisting(saved: LocalGitWorktree) {
    if (!saved.workspaceId || !saved.threadId) return
    setBusy(true)
    setError(null)
    try {
      const actual = await client.get(saved.workspaceId)
      if (
        actual.id !== saved.workspaceId ||
        actual.threadId !== saved.threadId ||
        actual.projectId !== project?.id ||
        actual.path !== saved.path
      )
        throw new Error(
          "Worktree identity changed; reconnect its original companion",
        )
      onOpenWorkspace?.(actual.threadId)
      setMachineOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Worktree unavailable")
    } finally {
      setBusy(false)
    }
  }

  const mode = workspace?.mode ?? choice?.mode
  const source =
    workspace?.branch ??
    workspace?.sourceRef ??
    choice?.sourceRef ??
    (githubMode ? state.githubBranch ?? githubDefaultBranch : null) ??
    branches.find((branch) => branch.current)?.ref
  const branchLabel =
    source?.replace(/^refs\/(?:heads|remotes)\//, "") || "Choose branch"

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <Popover
        open={machineOpen}
        onOpenChange={(value) => {
          setMachineOpen(value)
          setExistingOpen(false)
          setQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={trigger}
            aria-label="Choose machine and worktree"
          >
            {mode ? (
              <Laptop className="size-3.5 shrink-0" />
            ) : (
              <Cloud className="size-3.5 shrink-0" />
            )}
            <span className="max-w-48 truncate">
              {mode
                ? `This computer · ${mode === "worktree" ? (workspace ? "Worktree" : "New worktree") : "Current checkout"}`
                : "Web/cloud"}
            </span>
            {client.connected && (
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            )}
            <ChevronDown className="size-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className={`${panel} w-72`}>
          <p className="px-2 py-1 text-[11px] text-[#888]">Machine</p>
          <button
            type="button"
            className={row}
            disabled={locked}
            onClick={() => {
              state.select(null)
              setMachineOpen(false)
            }}
          >
            <Cloud className="size-3.5" />
            Web/cloud{!mode && <Check className="ml-auto size-3" />}
          </button>
          <button
            type="button"
            className={row}
            onClick={client.connected ? () => select("worktree") : settings}
            disabled={locked && client.connected}
          >
            <Laptop className="size-3.5" />
            <span className="flex-1">This computer</span>
            <span className="text-[10px] text-[#888]">
              {client.connected ? "Connected" : "Connect…"}
            </span>
          </button>
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className={row}
            disabled={locked}
            onClick={() => select("worktree")}
          >
            <FolderGit2 className="size-3.5" />
            New worktree
            {mode === "worktree" && <Check className="ml-auto size-3" />}
          </button>
          <Popover open={existingOpen} onOpenChange={setExistingOpen}>
            <PopoverTrigger asChild>
              <button type="button" className={row}>
                <FolderGit2 className="size-3.5" />
                Existing worktree
                <ChevronRight className="ml-auto size-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={6}
              className={`${panel} w-80`}
            >
              <input
                aria-label="Search worktrees"
                placeholder="Search worktrees"
                value={worktreeQuery}
                onChange={(event) => setWorktreeQuery(event.target.value)}
                className="w-full min-w-0 border-b border-white/10 bg-transparent px-3 py-2 text-xs outline-none"
              />
              <p className="px-3 py-2 text-[10px] text-[#888]">
                {connected
                  ? "Git worktrees on this computer. Nova-managed entries continue their bound thread."
                  : "Connect this computer to discover its Git worktrees. GitHub cannot list worktrees on your disk."}
              </p>
              <div className="max-h-56 overflow-auto">
                {existing
                  .filter((item) =>
                    `${item.threadId ? (workspaceLabels[item.threadId] ?? "") : ""} ${item.branch} ${item.path}`
                      .toLowerCase()
                      .includes(worktreeQuery.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      type="button"
                      key={item.path}
                      className={row}
                      disabled={
                        busy ||
                        !connected ||
                        !item.threadId ||
                        !item.workspaceId ||
                        !onOpenWorkspace ||
                        item.prunable
                      }
                      onClick={() => void openExisting(item)}
                    >
                      <GitBranch className="size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {(item.threadId
                            ? workspaceLabels[item.threadId]
                            : null) ??
                            item.branch ??
                            `detached @ ${item.head.slice(0, 7)}`}
                        </span>
                        <span className="block truncate text-[10px] text-[#888]">
                          {item.path}
                          {item.main ? " · main checkout" : ""}
                          {item.locked ? " · locked" : ""}
                          {item.prunable ? " · missing" : ""}
                          {!item.threadId ? " · discovery only" : ""}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
              {loadingWorktrees && (
                <p className="px-3 py-2 text-xs text-[#999]">
                  Loading Git worktrees…
                </p>
              )}
              {!existing.length && !loadingWorktrees && connected && (
                <p className="px-3 pb-3 text-xs text-[#999]">
                  {project
                    ? "No worktrees found."
                    : "Choose the matching project in workspace settings; Nova will not use a different folder."}
                </p>
              )}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            className={row}
            disabled={locked}
            onClick={() => select("current")}
          >
            <Laptop className="size-3.5" />
            Current checkout
            {mode === "current" && <Check className="ml-auto size-3" />}
          </button>
          <div className="my-1 border-t border-white/10" />
          <button type="button" className={row} onClick={settings}>
            Workspace settings…
          </button>
          {error && (
            <p role="alert" className="px-2 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
      <Popover
        open={branchOpen}
        onOpenChange={(value) => {
          setBranchOpen(value)
          setQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={`${trigger} ml-auto`}
            aria-label="Choose starting branch"
          >
            <GitBranch className="size-3.5 shrink-0" />
            <span className="max-w-40 truncate">{branchLabel}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className={`${panel} w-72`}>
          <label className="flex items-center gap-2 border-b border-white/10 px-2 py-2">
            <Search className="size-3.5 shrink-0 text-[#888]" />
            <input
              aria-label="Search starting branches"
              placeholder="Search branches"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
          <div className="max-h-72 overflow-auto">
            {branches
              .filter((branch) =>
                branch.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((branch) => (
                <button
                  key={branch.ref}
                  type="button"
                  className={row}
                  disabled={locked || (mode === "current" && !branch.current)}
                  onClick={() => {
                    if (githubMode) {
                      state.selectGithubBranch(branch.name)
                      setBranchOpen(false)
                    } else select(mode ?? "worktree", branch.ref)
                  }}
                >
                  <GitBranch className="size-3.5 shrink-0 text-[#777]" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.remote && (
                    <span className="text-[10px] text-[#888]">Remote</span>
                  )}
                  {(workspace
                    ? source === branch.name || source === branch.ref
                    : ((githubMode && state.githubBranch
                        ? `refs/heads/${state.githubBranch}`
                        : choice?.sourceRef) ??
                        branches.find((item) => item.current)?.ref) ===
                      branch.ref) && <Check className="size-3 shrink-0" />}
                </button>
              ))}
          </div>
          {loadingBranches && (
            <p className="flex items-center gap-2 px-2 py-3 text-xs text-[#999]">
              <Loader2 className="size-3 animate-spin" />
              Loading GitHub branches…
            </p>
          )}
          {!branches.length && !loadingBranches && !branchError && (
            <p className="px-2 py-3 text-xs text-[#999]">
              {githubMode
                ? "No branches found in this connected repository."
                : client.connected
                  ? "No matching project branches. Open workspace settings."
                  : "Connect this computer to load its branches."}
            </p>
          )}
          {githubMode && truncated && (
            <p className="px-2 py-2 text-[11px] text-amber-200">
              Branch listing is limited; more branches exist on GitHub.
            </p>
          )}
          {locked && (
            <p className="px-2 py-2 text-[11px] text-[#888]">
              This thread’s starting branch is fixed. Start a new thread to
              change it.
            </p>
          )}
          <div className="mt-1 flex border-t border-white/10">
            <button
              type="button"
              className={row}
              disabled={
                busy ||
                loadingBranches ||
                (githubMode ? !state.webProjectId : !project || !connected)
              }
              onClick={async () => {
                if (githubMode) {
                  setRefreshKey((value) => value + 1)
                  return
                }
                if (!project) return
                setBusy(true)
                try {
                  setLocalBranches(await client.branches(project.id, true))
                  setError(null)
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Fetch failed",
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy && <Loader2 className="size-3 animate-spin" />}Fetch
              branches
            </button>
            <button type="button" className={row} onClick={settings}>
              {githubMode ? "Local setup…" : "Settings…"}
            </button>
          </div>
          {branchError && (
            <p role="alert" className="px-2 py-2 text-xs text-red-200">
              {branchError}
            </p>
          )}
          {error && (
            <p role="alert" className="px-2 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
      {agentUsage}
      {workspace && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => state.requestPublish("pr")}
          className={trigger}
        >
          <GitPullRequest className="size-3.5" />
          Publish
        </button>
      )}
    </div>
  )
}
