"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  GitWorkspaceClient,
  type GitWorkspace,
  type WorkspaceChoice,
  type PublishInput,
} from "./git-workspace"
import { bindLocalWorktree, getLocalWorktreeBinding } from "./api"
import { activateManagedWorkspace } from "./local-workspace"

function readSaved<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null
  } catch {
    return null
  }
}

export function useGitWorkspace(
  userId: string,
  sessionId: string | null,
  projectId: string | null,
  enabled = true,
) {
  const client = useMemo(() => new GitWorkspaceClient(userId), [userId])
  const [revision, setRevision] = useState(0)
  const [workspace, setWorkspace] = useState<GitWorkspace | null>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [choice, setChoice] = useState<WorkspaceChoice | null>(null)
  const [publishAction, setPublishAction] = useState<
    PublishInput["action"] | null
  >(null)
  const [bindingError, setBindingError] = useState<string | null>(null)
  const selectionKey = `nova:git-selection:${userId}:${projectId ?? "none"}`
  const threadKey = useCallback(
    (id: string) => `nova:git-thread:${userId}:${id}`,
    [userId],
  )

  useEffect(() => {
    if (!enabled || !workspace || workspace.threadId !== sessionId) return
    return activateManagedWorkspace({
      projectId,
      rootName: workspace.path.split(/[\\/]/).pop() ?? "Worktree",
      paths,
      read: (path) => client.read(workspace.id, path),
    })
  }, [workspace, sessionId, projectId, paths, client, enabled])

  useEffect(() => {
    let current = true
    const saved = sessionId
      ? readSaved<GitWorkspace>(threadKey(sessionId))
      : null
    queueMicrotask(() => {
      if (!current) return
      setChoice(readSaved<WorkspaceChoice>(selectionKey))
      setWorkspace(saved)
      setPaths([])
      setBindingError(null)
      if (saved && client.connected)
        void client
          .files(saved.id)
          .then((value) => {
            if (current) setPaths(value)
          })
          .catch(() => {})
      if (sessionId && enabled)
        void getLocalWorktreeBinding(sessionId)
          .then(async ({ binding }) => {
            if (!binding || !current) return
            const actual = await client.get(binding.workspaceId)
            if (
              actual.threadId !== sessionId ||
              actual.projectId !== binding.projectId ||
              actual.baseSha !== binding.baseSha ||
              actual.sourceRef !== binding.sourceRef
            )
              throw new Error(
                "Local workspace identity changed; reconnect its original companion",
              )
            const files = await client.files(actual.id)
            if (!current) return
            localStorage.setItem(threadKey(sessionId), JSON.stringify(actual))
            setWorkspace(actual)
            setPaths(files)
          })
          .catch((cause) => {
            if (current)
              setBindingError(
                cause instanceof Error
                  ? cause.message
                  : "Reconnect the local workspace",
              )
          })
    })
    return () => {
      current = false
    }
  }, [selectionKey, sessionId, threadKey, revision, client, enabled])

  const select = useCallback(
    (value: WorkspaceChoice | null) => {
      if (sessionId)
        throw new Error(
          "This thread already has a workspace. Start a new thread to change its starting branch.",
        )
      if (value) localStorage.setItem(selectionKey, JSON.stringify(value))
      else localStorage.removeItem(selectionKey)
      setChoice(value)
    },
    [selectionKey, sessionId],
  )

  const ensure = useCallback(
    async (id: string, create = false) => {
      const { binding } = await getLocalWorktreeBinding(id)
      const saved = readSaved<GitWorkspace>(threadKey(id))
      if (binding || saved) {
        const actual = await client.get(binding?.workspaceId ?? saved!.id)
        if (
          actual.threadId !== id ||
          actual.projectId !== (binding?.projectId ?? saved!.projectId) ||
          actual.baseSha !== (binding?.baseSha ?? saved!.baseSha)
        )
          throw new Error(
            "Workspace identity changed; automatic execution was stopped",
          )
        if (!binding)
          await bindLocalWorktree(id, {
            workspaceId: actual.id,
            projectId: actual.projectId,
            sourceRef: actual.sourceRef,
            baseSha: actual.baseSha,
            mode: actual.mode,
          })
        return actual
      }
      const pendingKey = `${threadKey(id)}:pending`
      const selected =
        readSaved<WorkspaceChoice>(pendingKey) ??
        (create ? readSaved<WorkspaceChoice>(selectionKey) : null)
      if (!selected) return null
      localStorage.setItem(pendingKey, JSON.stringify(selected))
      const created = await client.create(id, selected)
      if (created.threadId !== id)
        throw new Error("Companion returned a different thread’s workspace")
      localStorage.setItem(threadKey(id), JSON.stringify(created))
      await bindLocalWorktree(id, {
        workspaceId: created.id,
        projectId: created.projectId,
        sourceRef: created.sourceRef,
        baseSha: created.baseSha,
        mode: created.mode,
      })
      localStorage.removeItem(pendingKey)
      setWorkspace(created)
      setPaths(await client.files(created.id))
      return created
    },
    [client, selectionKey, threadKey],
  )

  return {
    client,
    workspace,
    paths,
    choice,
    select,
    ensure,
    bindingError,
    locked: Boolean(sessionId),
    refresh: () => setRevision((value) => value + 1),
    publishAction,
    requestPublish: setPublishAction,
  }
}

export type GitWorkspaceState = ReturnType<typeof useGitWorkspace>
