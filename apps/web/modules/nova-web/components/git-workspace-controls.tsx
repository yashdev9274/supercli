"use client"

import { useEffect, useState } from "react"
import {
  Check,
  GitBranch,
  Laptop,
  Loader2,
  Search,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { GitWorkspaceState } from "../use-git-workspace"
import { GitWorkspaceToolbar } from "./git-workspace-toolbar"
import type {
  GitBranch as Branch,
  GitProject,
  GitStatus,
  PublishInput,
  PublishPreview,
  PublishResult,
} from "../git-workspace"

const field =
  "w-full min-w-0 rounded-md border border-white/10 bg-[#121212] px-3 py-2 text-xs text-[#ddd] outline-none focus:border-[#777]"
const button =
  "inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs text-[#ddd] transition hover:bg-white/5 disabled:opacity-40"

export function GitWorkspaceControls({
  state,
  disabled = false,
  repositoryFullName,
  onOpenWorkspace,
  workspaceLabels,
}: {
  state: GitWorkspaceState
  disabled?: boolean
  repositoryFullName?: string | null
  onOpenWorkspace?: (threadId: string) => void
  workspaceLabels?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [port, setPort] = useState("47832")
  const [code, setCode] = useState("")
  const [projects, setProjects] = useState<GitProject[]>([])
  const [projectId, setProjectId] = useState(state.choice?.projectId ?? "")
  const [branches, setBranches] = useState<Branch[]>([])
  const [sourceRef, setSourceRef] = useState(state.choice?.sourceRef ?? "")
  const [mode, setMode] = useState<"current" | "worktree">(
    state.choice?.mode ?? "worktree",
  )
  const [newBranch, setNewBranch] = useState("")
  const [copyIgnored, setCopyIgnored] = useState(false)
  const [ignoredFiles, setIgnoredFiles] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initConfirm, setInitConfirm] = useState(false)
  const { client, choice, workspace } = state

  async function loadProjects() {
    const items = await client.projects()
    setProjects(items)
    const selected =
      items.find((item) => item.id === choice?.projectId) ??
      items.find(
        (item) =>
          repositoryFullName &&
          item.repositoryFullName?.toLowerCase() ===
            repositoryFullName.toLowerCase(),
      ) ??
      items[0]
    setProjectId(selected?.id ?? "")
  }

  useEffect(() => {
    if (!open || !client.connected) return
    let current = true
    void client
      .projects()
      .then((items) => {
        if (!current) return
        setProjects(items)
        const selected =
          items.find((item) => item.id === choice?.projectId) ??
          items.find(
            (item) =>
              repositoryFullName &&
              item.repositoryFullName?.toLowerCase() ===
                repositoryFullName.toLowerCase(),
          ) ??
          items[0]
        setProjectId(selected?.id ?? "")
      })
      .catch((cause) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [open, client, choice?.projectId, repositoryFullName])

  useEffect(() => {
    if (!open || !projectId || !client.connected) return
    let current = true
    setBranches([])
    setIgnoredFiles([])
    setCopyIgnored(false)
    void client.ignoredFiles(projectId).then(paths => { if (current) setIgnoredFiles(paths) }).catch(cause => { if (current) setError(cause.message) })
    void client
      .branches(projectId)
      .then((items) => {
        if (!current) return
        setBranches(items)
        setSourceRef(
          items.find((item) => item.ref === choice?.sourceRef)?.ref ??
            items.find((item) => item.current)?.ref ??
            items[0]?.ref ??
            "",
        )
      })
      .catch((cause) => {
        if (current) setError(cause.message)
      })
    return () => {
      current = false
    }
  }, [open, client, projectId, choice?.sourceRef])

  async function perform(operation: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Workspace request failed",
      )
    } finally {
      setBusy(false)
    }
  }

  const project = projects.find((item) => item.id === projectId)
  return (
    <>
      <GitWorkspaceToolbar state={state} disabled={disabled} repositoryFullName={repositoryFullName} onSettings={() => setOpen(true)} onOpenWorkspace={onOpenWorkspace} workspaceLabels={workspaceLabels} />
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          setError(null)
        }}
      >
        <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] overflow-y-auto border-white/10 bg-[#191919] text-[#ddd] sm:max-w-xl [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Thread workspace</DialogTitle>
            <DialogDescription>
              Choose the checkout and starting branch. Publishing is always
              confirmed separately.
            </DialogDescription>
          </DialogHeader>
          {workspace && !client.connected && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void perform(async () => {
                  await client.pair(Number(port), code.trim())
                  setCode("")
                  state.refresh()
                })
              }}
              className="flex gap-2"
            >
              <input
                aria-label="Companion port"
                className={`${field} w-24`}
                type="number"
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
              <input
                aria-label="Workspace pairing code"
                className={field}
                placeholder="New pairing code"
                autoComplete="off"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <button className={button} disabled={busy || !code.trim()}>
                Reconnect
              </button>
            </form>
          )}
          {state.bindingError && (
            <p role="alert" className="text-xs text-amber-200">
              {state.bindingError}
            </p>
          )}
          {workspace ? (
            <div className="space-y-3 text-xs">
              <p className="flex items-center gap-2">
                <Laptop size={14} /> Local companion ·{" "}
                {workspace.mode === "worktree"
                  ? "Isolated worktree"
                  : "Current checkout"}
              </p>
              <p className="break-all rounded-md bg-black/20 p-3 font-mono">
                {workspace.path}
              </p>
              <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 break-all">
                <dt className="text-[#777]">Started from</dt>
                <dd>{workspace.sourceRef}</dd>
                <dt className="text-[#777]">Starting SHA</dt>
                <dd className="font-mono">
                  {workspace.baseSha.slice(0, 12) || "Unborn repository"}
                </dd>
                <dt className="text-[#777]">Working branch</dt>
                <dd>{workspace.branch ?? "Detached until publishing"}</dd>
              </dl>
              <p className="text-[#888]">
                This thread keeps its original workspace. Start a new thread to
                choose a different branch.
              </p>
              <button
                className={button}
                onClick={() => {
                  setOpen(false)
                  state.requestPublish("pr")
                }}
              >
                Review changes and publish
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-xs leading-6 text-[#999]">
                Local branches require Git on the execution computer—not browser
                folder access. Start the workspace companion from your Nova
                checkout:
                <pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-[10px] text-[#bbb]">
                  bun run workspace:local --project /path/to/project --origin{" "}
                  {typeof window !== "undefined"
                    ? window.location.origin
                    : "https://nova.supercodeai.tech"}
                </pre>
                <p>
                  Use a local clone for a connected GitHub repository. Unpushed
                  local branches are available on that computer only. No files
                  or credentials are sent until you explicitly work with them.
                </p>
              </div>
              {!client.connected ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    void perform(async () => {
                      await client.pair(Number(port), code.trim())
                      setCode("")
                      await loadProjects()
                      state.refresh()
                    })
                  }}
                  className="flex flex-wrap items-end gap-2"
                >
                  <label className="w-24 text-xs">
                    Port
                    <input
                      aria-label="Companion port"
                      className={field}
                      type="number"
                      value={port}
                      onChange={(event) => setPort(event.target.value)}
                    />
                  </label>
                  <label className="min-w-40 flex-1 text-xs">
                    Pairing code
                    <input
                      aria-label="Workspace pairing code"
                      className={field}
                      autoComplete="off"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </label>
                  <button className={button} disabled={busy || !code.trim()}>
                    {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                    Connect
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-emerald-300">
                      <Check size={13} /> Local companion connected
                    </span>
                    <button
                      className="text-[#888]"
                      onClick={() => {
                        client.disconnect()
                        setProjects([])
                        state.refresh()
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                  <label className="block text-xs">
                    Project on this computer
                    <select
                      aria-label="Git project"
                      className={`${field} mt-1`}
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value)
                        setError(null)
                        setInitConfirm(false)
                      }}
                    >
                      {projects.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name} · {item.path}
                        </option>
                      ))}
                    </select>
                  </label>
                  {repositoryFullName &&
                    project &&
                    project.repositoryFullName?.toLowerCase() !==
                      repositoryFullName.toLowerCase() && (
                      <div role="alert" className="space-y-2 text-xs text-amber-200">
                      <p>
                        This folder does not match {repositoryFullName}. Choose
                        its clone or select the matching project in Nova before
                        starting.
                      </p>
                      <button type="button" className={button} disabled={busy || state.locked} onClick={() => void perform(async () => { const cloned = await client.clone(repositoryFullName); setProjects(await client.projects()); setProjectId(cloned.id) })}>Clone {repositoryFullName} on this computer</button>
                      </div>
                    )}
                  {project && !project.isGit ? (
                    <div className="space-y-2 rounded border border-white/10 p-3 text-xs">
                      <p>
                        This folder has no Git repository. Initialization does
                        not commit any files.
                      </p>
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={initConfirm}
                          onChange={(event) =>
                            setInitConfirm(event.target.checked)
                          }
                        />{" "}
                        I approve initializing Git in this folder
                      </label>
                      <button
                        className={button}
                        disabled={!initConfirm || busy}
                        onClick={() =>
                          void perform(async () => {
                            await client.initialize(project.id)
                            await loadProjects()
                            setBranches(await client.branches(project.id))
                            setInitConfirm(false)
                          })
                        }
                      >
                        Initialize Git
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          className={`${button} ${mode === "worktree" ? "border-white/40 bg-white/5" : ""}`}
                          onClick={() => setMode("worktree")}
                        >
                          New worktree
                        </button>
                        <button
                          className={`${button} ${mode === "current" ? "border-white/40 bg-white/5" : ""}`}
                          onClick={() => setMode("current")}
                        >
                          Current checkout
                        </button>
                      </div>
                      <button type="button" className={button} disabled={busy || !projectId} onClick={() => void perform(async () => setBranches(await client.branches(projectId, true)))}>Fetch branches</button>
                      <div className="overflow-hidden rounded-lg border border-white/10">
                        <label className="flex items-center gap-2 border-b border-white/10 p-2">
                          <Search size={13} />
                          <input
                            aria-label="Search branches"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search local and remote branches…"
                            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                          />
                        </label>
                        <div className="max-h-48 overflow-auto">
                          {branches
                            .filter((branch) =>
                              `${branch.name} ${branch.ref}`
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                            )
                            .map((branch) => (
                              <button
                                type="button"
                                key={branch.ref}
                                aria-pressed={sourceRef === branch.ref}
                                disabled={mode === "current" && !branch.current}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 disabled:opacity-40"
                                onClick={() => setSourceRef(branch.ref)}
                              >
                                <GitBranch size={12} />
                                <span className="flex-1 truncate">
                                  {branch.name}
                                </span>
                                <span className="text-[9px] text-[#777]">
                                  {branch.remote ? "Remote" : "Local"}
                                  {branch.checkedOut ? " · checked out" : ""}
                                </span>
                                {sourceRef === branch.ref && (
                                  <Check size={12} />
                                )}
                              </button>
                            ))}
                          {!branches.length && (
                            <p className="p-3 text-xs text-[#888]">
                              No commits yet. Use Current checkout for your
                              initial commit.
                            </p>
                          )}
                        </div>
                      </div>
                      {mode === "worktree" ? (
                        <>
                          <label className="block text-xs">
                            New working branch (optional)
                            <input
                              className={`${field} mt-1`}
                              value={newBranch}
                              onChange={(event) =>
                                setNewBranch(event.target.value)
                              }
                              placeholder="Leave empty to work detached until publishing"
                            />
                          </label>
                          <label className="flex items-start gap-2 text-xs text-[#aaa]">
                            <input
                              type="checkbox"
                              checked={copyIgnored}
                              disabled={!ignoredFiles.length}
                              onChange={(event) =>
                                setCopyIgnored(event.target.checked)
                              }
                              className="mt-0.5"
                            />
                            <span>
                              Copy ignored files explicitly listed in
                              .worktreeinclude, on this computer only. They are
                              not attached to chat or committed.
                            </span>
                          </label>
                          {ignoredFiles.length > 0 && <div className="rounded border border-white/10 p-2 text-[10px] text-[#999]"><p>Files selected by .worktreeinclude:</p><ul className="mt-1 max-h-24 overflow-auto font-mono">{ignoredFiles.map(path => <li key={path}>{path}</li>)}</ul></div>}
                          <p className="text-[11px] text-[#888]">
                            Only committed files from the selected branch are
                            included. Original staged and unstaged changes stay
                            in the original checkout.
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-amber-200">
                          Nova’s proposed edits will be applied to this folder
                          itself. The current branch and any existing changes
                          stay in place.
                        </p>
                      )}
                      <button
                        className={`${button} w-full bg-white/10`}
                        disabled={
                          state.locked ||
                          busy ||
                          !projectId ||
                          (mode === "worktree" && !sourceRef) ||
                          Boolean(
                            repositoryFullName &&
                            project?.repositoryFullName?.toLowerCase() !==
                              repositoryFullName.toLowerCase(),
                          )
                        }
                        onClick={() => {
                          const selectedRef =
                            mode === "current"
                              ? (branches.find((branch) => branch.current)
                                  ?.ref ?? "")
                              : sourceRef
                          state.select({
                            projectId,
                            sourceRef: selectedRef,
                            mode,
                            copyIgnored,
                            ...(newBranch.trim() && mode === "worktree"
                              ? { newBranch: newBranch.trim() }
                              : {}),
                          })
                          setOpen(false)
                        }}
                      >
                        Use for new thread
                      </button>
                      {state.locked && (
                        <p className="text-xs text-[#888]">
                          Start a new thread to select a starting branch. For a
                          bound thread, connect its original companion to
                          restore the workspace.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              {choice && !state.locked && (
                <button
                  className="text-xs text-[#888] underline"
                  onClick={() => {
                    state.select(null)
                    setOpen(false)
                  }}
                >
                  Use existing web/cloud workflow instead
                </button>
              )}
            </div>
          )}
          {error && (
            <p
              role="alert"
              className="rounded border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200"
            >
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <PublishDialog state={state} disabled={disabled} />
    </>
  )
}

function PublishDialog({
  state,
  disabled,
}: {
  state: GitWorkspaceState
  disabled: boolean
}) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [files, setFiles] = useState<string[]>([])
  const [branch, setBranch] = useState("")
  const [baseBranch, setBaseBranch] = useState("")
  const [remote, setRemote] = useState("origin")
  const [message, setMessage] = useState("")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [preview, setPreview] = useState<PublishPreview | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const workspace = state.workspace
  const action = state.publishAction

  useEffect(() => {
    if (!action || !workspace) return
    let active = true
    setStatus(null)
    setPreview(null)
    setResult(null)
    setError(null)
    setFiles([])
    setBranch(workspace.mode === "worktree" && workspace.branch ? workspace.branch : `nova/work-${workspace.threadId.slice(-8)}`)
    setBaseBranch(
      workspace.sourceRef
        .replace(/^refs\/heads\//, "")
        .replace(/^refs\/remotes\/[^/]+\//, ""),
    )
    void state.client
      .status(workspace.id)
      .then((value) => {
        if (active) {
          setStatus(value)
          setFiles(value.files.map((file) => file.path))
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message)
      })
    return () => {
      active = false
    }
  }, [action, workspace, state.client])

  async function review() {
    if (!workspace || !action) return
    setBusy(true)
    setError(null)
    try {
      setPreview(
        await state.client.preview({
          workspaceId: workspace.id,
          action,
          branch,
          baseBranch,
          remote,
          message,
          files,
          title,
          body,
        }),
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare publication",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={Boolean(action && workspace)}
      onOpenChange={(value) => {
        if (!value && !busy) {
          state.requestPublish(null)
          state.refresh()
        }
      }}
    >
      <DialogContent className="max-h-[90svh] grid-cols-[minmax(0,1fr)] overflow-y-auto border-white/10 bg-[#191919] text-[#ddd] sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            {result
              ? "Published"
              : preview
                ? "Confirm this exact publication"
                : "Commit, push, or create a pull request"}
          </DialogTitle>
          <DialogDescription>
            Nothing is committed or pushed until you confirm the preview.
            Changes to the workspace invalidate approval.
          </DialogDescription>
        </DialogHeader>
        {workspace?.mode === "current" && <p className="text-xs text-amber-200">Current-checkout publication creates the approved branch without switching or staging your original checkout. Use an isolated worktree to continue editing directly on the published branch.</p>}
        {result ? (
          <div className="space-y-3 text-sm">
            <p className="flex gap-2 text-emerald-300">
              <Check size={16} /> {result.commitSha.slice(0, 12)} on{" "}
              {result.branch}
            </p>
            {result.prUrl && (
              <a
                className="underline"
                href={result.prUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open pull request
              </a>
            )}
          </div>
        ) : preview ? (
          <div className="space-y-3 text-xs">
            <dl className="grid grid-cols-[90px_1fr] gap-2">
              <dt>Action</dt>
              <dd>{preview.action}</dd>
              <dt>Destination</dt>
              <dd>
                {preview.remote} / {preview.branch}
              </dd>
              {preview.action === "pr" && (
                <>
                  <dt>PR base</dt>
                  <dd>{preview.baseBranch}</dd>
                </>
              )}
              <dt>Commit</dt>
              <dd>{preview.message || "No new commit"}</dd>
              <dt>Files</dt>
              <dd>{preview.files.length} selected</dd>
            </dl>
            <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/30 p-3 text-[10px]">
              {preview.diff ||
                "No uncommitted changes selected. Existing commits will be published."}
            </pre>
            <p className="text-[#888]">
              Approval expires at{" "}
              {new Date(preview.expiresAt).toLocaleTimeString()}. HEAD, files,
              and remote state are checked again before execution.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className={button}
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Back
              </button>
              <button
                className={`${button} bg-white/10`}
                disabled={busy || disabled}
                onClick={async () => {
                  setBusy(true)
                  setError(null)
                  try {
                    setResult(await state.client.publish(preview.id))
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Publication failed",
                    )
                    setPreview(null)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy && <Loader2 className="size-3 animate-spin" />}Confirm{" "}
                {preview.action === "pr"
                  ? "commit, push & PR"
                  : preview.action === "push"
                    ? "commit & push"
                    : "commit"}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void review()
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                Action
                <select
                  aria-label="Publish action"
                  className={`${field} mt-1`}
                  value={action ?? "commit"}
                  onChange={(event) =>
                    state.requestPublish(
                      event.target.value as PublishInput["action"],
                    )
                  }
                >
                  <option value="commit">Commit only</option>
                  <option value="push">Commit and push</option>
                  <option value="pr">Commit, push and create PR</option>
                </select>
              </label>
              <label className="text-xs">
                Remote
                <input
                  className={`${field} mt-1`}
                  value={remote}
                  onChange={(event) => setRemote(event.target.value)}
                />
              </label>
              <label className="text-xs">
                Destination branch
                <input
                  className={`${field} mt-1`}
                  required
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                />
              </label>
              <label className="text-xs">
                PR target base
                <input
                  className={`${field} mt-1`}
                  required={action === "pr"}
                  value={baseBranch}
                  onChange={(event) => setBaseBranch(event.target.value)}
                />
              </label>
            </div>
            <label className="block text-xs">
              Commit message
              <input
                className={`${field} mt-1`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Required when committing selected files"
              />
            </label>
            {action === "pr" && (
              <>
                <label className="block text-xs">
                  PR title
                  <input
                    className={`${field} mt-1`}
                    required
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="block text-xs">
                  PR description
                  <textarea
                    className={`${field} mt-1`}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    rows={3}
                  />
                </label>
              </>
            )}
            <fieldset className="max-h-40 overflow-auto rounded border border-white/10 p-3">
              <legend className="px-1 text-xs text-[#999]">
                Files to commit
              </legend>
              {status?.files.map((file) => (
                <label
                  key={file.path}
                  className="flex items-center gap-2 py-1 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={files.includes(file.path)}
                    onChange={(event) =>
                      setFiles((current) =>
                        event.target.checked
                          ? [...current, file.path]
                          : current.filter((path) => path !== file.path),
                      )
                    }
                  />
                  <span className="font-mono text-[10px] text-[#888]">
                    {file.status}
                  </span>
                  <span className="break-all">{file.path}</span>
                </label>
              ))}
              {status && !status.files.length && (
                <p className="text-xs text-[#888]">
                  No uncommitted changes. You can push existing commits or
                  create a PR.
                </p>
              )}
            </fieldset>
            <div className="flex justify-end">
              <button
                className={`${button} bg-white/10`}
                disabled={!status || busy || disabled}
              >
                {busy && <Loader2 className="size-3 animate-spin" />}Review
                publication
              </button>
            </div>
          </form>
        )}
        {error && (
          <p
            role="alert"
            className="rounded border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-200"
          >
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
