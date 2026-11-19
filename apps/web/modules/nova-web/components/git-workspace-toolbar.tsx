"use client"

import { useEffect, useState } from "react"
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
  type GitWorkspace,
} from "../git-workspace"
import type { GitWorkspaceState } from "../use-git-workspace"

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
}: {
  state: GitWorkspaceState
  disabled: boolean
  repositoryFullName?: string | null
  onSettings: () => void
  onOpenWorkspace?: (threadId: string) => void
  workspaceLabels?: Record<string, string>
}) {
  const [machineOpen, setMachineOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [existingOpen, setExistingOpen] = useState(false)
  const [projects, setProjects] = useState<GitProject[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [existing, setExisting] = useState<GitWorkspace[]>([])
  const [query, setQuery] = useState("")
  const [worktreeQuery, setWorktreeQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { client, choice, workspace, locked } = state
  const projectId = workspace?.projectId ?? choice?.projectId
  const project = projectId
    ? projects.find((item) => item.id === projectId)
    : (projects.find(
        (item) =>
          repositoryFullName &&
          item.repositoryFullName?.toLowerCase() ===
            repositoryFullName.toLowerCase(),
      ) ?? (!repositoryFullName ? projects[0] : undefined))

  useEffect(() => {
    if ((!machineOpen && !branchOpen) || !client.connected) return
    let current = true
    void client
      .projects()
      .then(async (items) => {
        const selected = projectId
          ? items.find((item) => item.id === projectId)
          : (items.find(
              (item) =>
                repositoryFullName &&
                item.repositoryFullName?.toLowerCase() ===
                  repositoryFullName.toLowerCase(),
            ) ?? (!repositoryFullName ? items[0] : undefined))
        const refs = selected ? await client.branches(selected.id) : []
        if (current) {
          setProjects(items)
          setBranches(refs)
          setError(null)
        }
      })
      .catch((cause) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [machineOpen, branchOpen, client, projectId, repositoryFullName])

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
          ? (branches.find((branch) => branch.current)?.ref ?? "")
          : (ref ??
            choice?.sourceRef ??
            branches.find((branch) => branch.current)?.ref ??
            branches[0]?.ref ??
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

  async function openExisting(saved: GitWorkspace) {
    setBusy(true)
    setError(null)
    try {
      const actual = await client.get(saved.id)
      if (
        actual.id !== saved.id ||
        actual.threadId !== saved.threadId ||
        actual.projectId !== saved.projectId ||
        actual.baseSha !== saved.baseSha ||
        actual.sourceRef !== saved.sourceRef ||
        actual.mode !== saved.mode
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
    branches.find((branch) => branch.current)?.ref
  const branchLabel =
    source?.replace(/^refs\/(?:heads|remotes)\//, "") || "Choose branch"

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
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
              <button
                type="button"
                className={row}
                disabled={!onOpenWorkspace}
                onClick={() => {
                  setExisting(
                    client
                      .savedWorkspaces()
                      .filter(
                        (item) =>
                          item.mode === "worktree" &&
                          (!project || item.projectId === project.id),
                      ),
                  )
                }}
              >
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
                Continue a saved worktree’s existing thread.
              </p>
              <div className="max-h-56 overflow-auto">
                {existing
                  .filter((item) =>
                      `${workspaceLabels[item.threadId] ?? ""} ${item.branch} ${item.sourceRef} ${item.threadId}`
                      .toLowerCase()
                      .includes(worktreeQuery.toLowerCase()),
                  )
                  .map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={row}
                      disabled={busy || !client.connected}
                      onClick={() => void openExisting(item)}
                    >
                      <GitBranch className="size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate">
                          {workspaceLabels[item.threadId] ??
                            "Continue conversation"}
                        </span>
                        <span className="block truncate text-[10px] text-[#888]">
                          {item.branch ??
                            `detached @ ${item.baseSha.slice(0, 7)}`}
                        </span>
                      </span>
                    </button>
                  ))}
              </div>
              {!existing.length && (
                <p className="px-3 pb-3 text-xs text-[#999]">
                  No saved worktrees for this project in this browser.
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
                  onClick={() => select(mode ?? "worktree", branch.ref)}
                >
                  <GitBranch className="size-3.5 shrink-0 text-[#777]" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.remote && (
                    <span className="text-[10px] text-[#888]">Remote</span>
                  )}
                  {(workspace
                    ? source === branch.name || source === branch.ref
                    : (choice?.sourceRef ??
                        branches.find((item) => item.current)?.ref) ===
                      branch.ref) && <Check className="size-3 shrink-0" />}
                </button>
              ))}
          </div>
          {!branches.length && (
            <p className="px-2 py-3 text-xs text-[#999]">
              {client.connected
                ? "No matching project branches. Open workspace settings."
                : "Connect this computer to load its branches."}
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
              disabled={!project || busy || !client.connected}
              onClick={async () => {
                if (!project) return
                setBusy(true)
                try {
                  setBranches(await client.branches(project.id, true))
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
              Settings…
            </button>
          </div>
          {error && (
            <p role="alert" className="px-2 py-2 text-xs text-red-200">
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
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
