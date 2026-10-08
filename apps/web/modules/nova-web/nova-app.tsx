"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Menu, MessageSquare, X } from "lucide-react"

import {
  bindSessionLocalProject,
  createSession,
  decideApproval,
  getSession,
  listApprovals,
  listConnectors,
  listSessions,
  streamTurn,
  syncSession,
  type LocalProjectDto,
} from "@/modules/nova-web/api"
import { ApprovalsView } from "@/modules/nova-web/components/approvals"
import { ConnectionsView } from "@/modules/nova-web/components/connections"
import { EmptyHome } from "@/modules/nova-web/components/home"
import { MoreView } from "@/modules/nova-web/components/more"
import { PullDetailView } from "@/modules/nova-web/components/pull-detail"
import { PullsView } from "@/modules/nova-web/components/pulls"
import { SettingsView } from "@/modules/nova-web/components/settings"
import {
  normalizeSettingsSection,
  type SettingsSectionId,
} from "@/modules/nova-web/settings-sections"
import { NovaSidebar } from "@/modules/nova-web/components/sidebar"
import { NovaMark } from "@/modules/nova-web/components/timeline"
import { ThreadView } from "@/modules/nova-web/components/thread"
import {
  DEFAULT_NOVA_MODEL,
  DEFAULT_NOVA_PROVIDER,
  type HarnessProvider,
  type NovaAgentMode,
  type NovaEffort,
} from "@/modules/nova-web/models"
import type {
  AgentSessionSummary,
  ApprovalRequest,
  ConnectorStatus,
  NovaUser,
  SessionDetail,
  TimelineEntry,
  WorkspaceView,
} from "@/modules/nova-web/types"
import {
  reduceWorkingSteps,
  tickWorkingSteps,
  type WorkingStep,
} from "@/modules/nova-web/working-steps"
import {
  getActiveLocalProjectId,
  restoreLocalWorkspace,
  type LocalWorkspaceState,
} from "@/modules/nova-web/local-workspace"
import type { LocalAttachment } from "@/modules/nova/attachments/contracts"
import type { NovaReference } from "@/modules/nova/references/contracts"

const PENDING_TURN_KEY = "nova:pending-turn"

type PendingTurn = {
  sessionId: string
  content: string
  model: string
  provider: HarnessProvider
  effort: NovaEffort
  mode: NovaAgentMode
  references?: NovaReference[]
  localAttachments?: LocalAttachment[]
}

type NovaAppProps = {
  initialSessions: AgentSessionSummary[]
  user: NovaUser
  initialSessionId?: string | null
  initialPullId?: string | null
  initialView?: WorkspaceView
  initialSettingsSection?: string | null
}

function readPendingTurn(): PendingTurn | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(PENDING_TURN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingTurn
    if (!parsed?.sessionId || !parsed?.content) return null
    return parsed
  } catch {
    return null
  }
}

function writePendingTurn(turn: PendingTurn) {
  sessionStorage.setItem(PENDING_TURN_KEY, JSON.stringify(turn))
}

function clearPendingTurn() {
  sessionStorage.removeItem(PENDING_TURN_KEY)
}

function parseRoute(pathname: string): {
  view: WorkspaceView
  sessionId: string | null
  pullId: string | null
} {
  const clean = pathname.replace(/\/nova-app-internal/g, "") || "/"
  if (clean.startsWith("/s/")) {
    return {
      view: "session",
      sessionId: clean.slice(3).split("/")[0] || null,
      pullId: null,
    }
  }
  if (clean.startsWith("/pulls/")) {
    return {
      view: "pull",
      sessionId: null,
      pullId: decodeURIComponent(clean.slice("/pulls/".length).split("/")[0] || ""),
    }
  }
  if (clean.startsWith("/pulls")) return { view: "pulls", sessionId: null, pullId: null }
  if (clean.startsWith("/approvals")) return { view: "approvals", sessionId: null, pullId: null }
  if (clean.startsWith("/connections")) return { view: "connections", sessionId: null, pullId: null }
  if (clean.startsWith("/more")) return { view: "more", sessionId: null, pullId: null }
  if (clean.startsWith("/settings")) return { view: "settings", sessionId: null, pullId: null }
  return { view: "home", sessionId: null, pullId: null }
}

function mergeTimeline(
  current: TimelineEntry[],
  messages: TimelineEntry[],
  activities: TimelineEntry[],
): TimelineEntry[] {
  const map = new Map<string, TimelineEntry>()
  for (const entry of [...current, ...messages, ...activities]) {
    map.set(`${entry.kind}-${entry.id}`, entry)
  }
  return [...map.values()].sort((a, b) => a.sequence - b.sequence)
}

export function NovaApp({
  initialSessions,
  user,
  initialSessionId = null,
  initialPullId = null,
  initialView = "home",
  initialSettingsSection = null,
}: NovaAppProps) {
  const router = useRouter()
  const pathname = usePathname()
  const search =
    typeof window !== "undefined" ? window.location.search : ""
  const settingsSection = useMemo(() => {
    const raw = initialSettingsSection
      ?? (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("section")
        : null)
    return normalizeSettingsSection(raw)
  }, [initialSettingsSection, search])

  const route = useMemo(() => {
    const parsed = parseRoute(pathname)
    if (!pathname || pathname === "/") {
      if (initialPullId) {
        return { view: "pull" as const, sessionId: null, pullId: initialPullId }
      }
      return {
        view: initialSessionId ? "session" as const : initialView,
        sessionId: initialSessionId,
        pullId: null,
      }
    }
    return parsed
  }, [pathname, initialPullId, initialSessionId, initialView])

  const [sessions, setSessions] = useState(initialSessions)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [cursor, setCursor] = useState(0)
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([])
  const [query, setQuery] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [draft, setDraft] = useState("")
  const [references, setReferences] = useState<NovaReference[]>([])
  const [localFiles, setLocalFiles] = useState<LocalAttachment[]>([])
  const [localProject, setLocalProject] = useState<LocalProjectDto | null>(null)
  const [model, setModel] = useState(DEFAULT_NOVA_MODEL)
  const [provider, setProvider] = useState<HarnessProvider>(DEFAULT_NOVA_PROVIDER)
  const [effort, setEffort] = useState<NovaEffort>("high")
  const [agentMode, setAgentMode] = useState<NovaAgentMode>("agent")
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [streamPhase, setStreamPhase] = useState<string | null>(null)
  const [workingSteps, setWorkingSteps] = useState<WorkingStep[]>([])
  const [workingSince, setWorkingSince] = useState<number | null>(null)
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const abortRef = useRef(false)
  const cursorRef = useRef(0)
  const streamingRef = useRef(false)
  const turnStartedRef = useRef<string | null>(null)

  const selectedId = route.sessionId
  const selectedPullId = route.pullId
  const view = route.view
  const pendingApprovals = approvals.filter((item) => item.status === "pending").length

  const navigate = useCallback(
    (href: string) => {
      setSidebarOpen(false)
      setReferences([])
      setLocalFiles([])
      router.push(href)
    },
    [router],
  )

  const openSettingsSection = useCallback((next: SettingsSectionId) => {
    const href = next === "general" ? "/settings" : `/settings?section=${next}`
    navigate(href)
  }, [navigate])

  useEffect(() => {
    if (view !== "settings") return
    const raw = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("section")
      : initialSettingsSection
    if (raw && normalizeSettingsSection(raw) !== raw) {
      navigate("/settings")
    }
  }, [initialSettingsSection, navigate, view])

  const setSyncCursor = useCallback((value: number | ((current: number) => number)) => {
    setCursor((current) => {
      const next = typeof value === "function" ? value(current) : value
      cursorRef.current = next
      return next
    })
  }, [])

  const loadSharedState = useCallback(async () => {
    try {
      const [sessionList, approvalList, connectorList] = await Promise.all([
        listSessions(),
        listApprovals(),
        listConnectors(),
      ])
      setSessions(sessionList.sessions)
      setApprovals(
        Array.isArray(approvalList)
          ? approvalList
          : "approvals" in approvalList
            ? approvalList.approvals
            : [],
      )
      setConnectors(connectorList.connectors)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh Nova")
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string, reset = false) => {
    const [detailResponse, sync] = await Promise.all([
      getSession(sessionId),
      syncSession(sessionId, reset ? 0 : cursorRef.current, 500),
    ])
    setSession(detailResponse.session)
    setLocalProject(detailResponse.session.localProject ?? null)
    if (detailResponse.session.localProjectId) {
      void restoreLocalWorkspace(detailResponse.session.localProjectId).catch(() => undefined)
    }
    if (reset) {
      setTimeline(
        mergeTimeline(
          [],
          sync.messages.map((entry) => ({ ...entry, kind: "message" as const })),
          sync.activities.map((entry) => ({ ...entry, kind: "activity" as const })),
        ),
      )
      setSyncCursor(sync.nextSequence)
    } else {
      setTimeline((current) =>
        mergeTimeline(
          current,
          sync.messages.map((entry) => ({ ...entry, kind: "message" as const })),
          sync.activities.map((entry) => ({ ...entry, kind: "activity" as const })),
        ),
      )
      setSyncCursor((value) => Math.max(value, sync.nextSequence))
    }
    return detailResponse.session
  }, [setSyncCursor])

  const pullSync = useCallback(async (sessionId: string) => {
    let after = cursorRef.current
    let guard = 0
    while (guard < 20) {
      guard += 1
      const page = await syncSession(sessionId, after, 200)
      setTimeline((current) =>
        mergeTimeline(
          current,
          page.messages.map((entry) => ({ ...entry, kind: "message" as const })),
          page.activities.map((entry) => ({ ...entry, kind: "activity" as const })),
        ),
      )
      after = page.nextSequence
      setSyncCursor(after)
      if (!page.hasMore) break
    }
    const detail = await getSession(sessionId)
    setSession(detail.session)
  }, [setSyncCursor])

  useEffect(() => {
    void loadSharedState()
    const timer = window.setInterval(() => {
      void loadSharedState()
      if (selectedId && !streaming) void pullSync(selectedId).catch(() => undefined)
    }, 8_000)
    return () => window.clearInterval(timer)
  }, [loadSharedState, pullSync, selectedId, streaming])

  useEffect(() => {
    if (!selectedId) {
      setSession(null)
      setTimeline([])
      setSyncCursor(0)
      turnStartedRef.current = null
      return
    }
    let active = true
    startTransition(async () => {
      try {
        // While a harness turn is streaming, only refresh session metadata —
        // never reset the live timeline.
        if (streamingRef.current) {
          const detail = await getSession(selectedId)
          if (active) setSession(detail.session)
        } else {
          await loadSession(selectedId, true)
        }
        if (active) setError(null)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load session")
      }
    })
    return () => {
      active = false
    }
  }, [loadSession, selectedId, setSyncCursor])

  async function handleLocalProjectChange(workspace: LocalWorkspaceState) {
    const projectId = workspace.projectId
    if (!projectId) {
      setLocalProject(null)
      return
    }
    const summary: LocalProjectDto = {
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
    }
    setLocalProject(summary)
    if (selectedId) {
      try {
        const bound = await bindSessionLocalProject(selectedId, projectId)
        if (bound.project) setLocalProject(bound.project)
        setSession((current) =>
          current
            ? {
                ...current,
                localProjectId: bound.localProjectId,
                localProject: bound.project,
              }
            : current,
        )
      } catch (error) {
        setError(error instanceof Error ? error.message : "Could not link local project to this thread")
      }
    }
  }

  async function startThread(
    objective: string,
    selectedReferences: NovaReference[] = [],
    selectedLocalFiles: LocalAttachment[] = [],
  ) {
    startTransition(async () => {
      try {
        const projectId = getActiveLocalProjectId() || localProject?.id || null
        const response = await createSession(objective, { localProjectId: projectId })
        setSessions((current) => [
          response.session,
          ...current.filter((item) => item.id !== response.session.id),
        ])
        // Survive the home → /s/:id remount so the harness turn actually starts.
        writePendingTurn({
          sessionId: response.session.id,
          content: objective,
          model,
          provider,
          effort,
          mode: agentMode,
          references: selectedReferences,
          localAttachments: selectedLocalFiles,
        })
        navigate(`/s/${response.session.id}`)
        setError(null)
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "Could not create thread")
      }
    })
  }

  const runTurn = useCallback(async (
    sessionId: string,
    content: string,
    opts?: {
      model?: string
      provider?: HarnessProvider
      effort?: NovaEffort
      mode?: NovaAgentMode
      references?: NovaReference[]
      localAttachments?: LocalAttachment[]
    },
  ) => {
    if (streamingRef.current) return
    streamingRef.current = true
    abortRef.current = false
    turnStartedRef.current = sessionId
    setStreaming(true)
    setStreamingText("")
    setStreamPhase("Starting…")
    setWorkingSteps([])
    setWorkingSince(Date.now())
    setDraft("")
    setReferences([])
    setLocalFiles([])
    try {
      const clientMessageId = crypto.randomUUID()
      for await (const event of streamTurn(sessionId, content, {
        clientMessageId,
        model: opts?.model ?? model,
        provider: opts?.provider ?? provider,
        effort: opts?.effort ?? effort,
        mode: opts?.mode ?? agentMode,
        references: opts?.references ?? [],
        localAttachments: opts?.localAttachments ?? [],
      })) {
        if (abortRef.current) break
        if (event.type === "status") {
          setStreamPhase(event.message)
          setWorkingSteps((steps) => reduceWorkingSteps(steps, { type: "status", message: event.message }))
        } else if (event.type === "user_message") {
          setTimeline((current) =>
            mergeTimeline(current, [{ ...event.message, kind: "message" as const }], []),
          )
          setSyncCursor((value) => Math.max(value, event.latestSequence))
        } else if (event.type === "text") {
          setStreamingText((value) => value + event.content)
          setStreamPhase(null)
          setWorkingSteps((steps) => reduceWorkingSteps(steps, { type: "text" }))
        } else if (event.type === "reasoning") {
          if (event.content.trim()) {
            setStreamPhase("Thinking…")
            setWorkingSteps((steps) =>
              reduceWorkingSteps(steps, { type: "reasoning", content: event.content }),
            )
          }
        } else if (event.type === "activity") {
          setTimeline((current) =>
            mergeTimeline(current, [], [{ ...event.activity, kind: "activity" as const }]),
          )
          setWorkingSteps((steps) =>
            reduceWorkingSteps(steps, {
              type: "activity",
              activity: {
                type: event.activity.type,
                title: event.activity.title,
                body: event.activity.body,
                status: event.activity.status,
              },
            }),
          )
          if (event.activity.type === "response") {
            setStreamingText("")
          }
        } else if (event.type === "error") {
          setError(event.message)
        } else if (event.type === "finish") {
          if (event.latestSequence != null) {
            setSyncCursor((value) => Math.max(value, event.latestSequence!))
          }
        }
      }
      await Promise.all([loadSharedState(), pullSync(sessionId)])
    } catch (turnError) {
      setError(turnError instanceof Error ? turnError.message : "Turn failed")
    } finally {
      streamingRef.current = false
      setStreaming(false)
      setStreamingText("")
      setStreamPhase(null)
      setWorkingSteps([])
      setWorkingSince(null)
    }
  }, [agentMode, effort, loadSharedState, model, provider, pullSync, setSyncCursor])

  // Keep "Thinking for Xs" labels live while reasoning is in flight.
  useEffect(() => {
    if (!streaming) return
    const id = window.setInterval(() => {
      setWorkingSteps((steps) => tickWorkingSteps(steps))
    }, 1000)
    return () => window.clearInterval(id)
  }, [streaming])

  // After navigating to a new thread, pick up the pending first turn.
  useEffect(() => {
    if (!selectedId || streamingRef.current) return
    const pending = readPendingTurn()
    if (!pending || pending.sessionId !== selectedId) return
    if (turnStartedRef.current === selectedId) return
    clearPendingTurn()
    if (pending.model) setModel(pending.model)
    if (pending.provider) setProvider(pending.provider)
    if (pending.effort) setEffort(pending.effort)
    if (pending.mode) setAgentMode(pending.mode)
    void runTurn(selectedId, pending.content, {
      model: pending.model,
      provider: pending.provider,
      effort: pending.effort,
      mode: pending.mode,
      references: pending.references,
      localAttachments: pending.localAttachments,
    })
  }, [runTurn, selectedId])

  function submitFollowUp() {
    if (!selectedId || streamingRef.current) return
    const content = draft.trim()
    if (!content && localFiles.length === 0) return
    void runTurn(selectedId, content || "Please review the attached local files.", {
      references,
      localAttachments: localFiles,
    })
  }

  function handleModelChange(selection: { provider: HarnessProvider; model: string }) {
    setProvider(selection.provider)
    setModel(selection.model)
  }

  function onDecision(approval: ApprovalRequest, decision: "approved" | "denied") {
    setDecidingApprovalId(approval.id)
    void decideApproval(approval, decision)
      .then(loadSharedState)
      .catch((decisionError) => {
        setError(decisionError instanceof Error ? decisionError.message : "Could not record decision")
      })
      .finally(() => setDecidingApprovalId(null))
  }

  const sidebar = (
    <NovaSidebar
      user={user}
      sessions={sessions}
      selectedId={selectedId}
      selectedPullId={selectedPullId}
      view={view}
      query={query}
      pendingApprovals={pendingApprovals}
      onQueryChange={setQuery}
      onNavigate={navigate}
      onNewSession={() => navigate("/")}
      onClose={() => setSidebarOpen(false)}
    />
  )

  const content = (
    <>
      {view === "connections" ? (
        <ConnectionsView
          connectors={connectors}
          loading={isPending}
          onRefreshConnectors={() => void loadSharedState()}
        />
      ) : view === "settings" ? (
        <SettingsView
          user={user}
          section={settingsSection}
          onSectionChange={openSettingsSection}
          onBack={() => navigate("/")}
          onNavigate={navigate}
        />
      ) : view === "approvals" ? (
        <ApprovalsView
          approvals={approvals}
          decidingApprovalId={decidingApprovalId}
          onDecision={onDecision}
          onOpenSession={(sessionId) => navigate(`/s/${sessionId}`)}
        />
      ) : view === "pulls" ? (
        <PullsView onOpenPull={(id) => navigate(`/pulls/${encodeURIComponent(id)}`)} />
      ) : view === "pull" && selectedPullId ? (
        <PullDetailView
          pullId={selectedPullId}
          onBack={() => navigate("/pulls")}
        />
      ) : view === "more" ? (
        <MoreView />
      ) : selectedId && session ? (
        <ThreadView
          session={session}
          timeline={timeline}
          approvals={approvals}
          draft={draft}
          references={references}
          onReferencesChange={setReferences}
          localFiles={localFiles}
          onLocalFilesChange={setLocalFiles}
          localProject={localProject ?? session.localProject ?? null}
          onLocalProjectChange={(workspace) => void handleLocalProjectChange(workspace)}
          streamingText={streamingText}
          streamPhase={streamPhase}
          workingSteps={workingSteps}
          streaming={streaming}
          workingSince={workingSince}
          loading={isPending}
          decidingApprovalId={decidingApprovalId}
          detailsOpen={detailsOpen}
          model={model}
          provider={provider}
          effort={effort}
          mode={agentMode}
          onDraftChange={setDraft}
          onModelChange={handleModelChange}
          onEffortChange={setEffort}
          onModeChange={setAgentMode}
          onSubmit={submitFollowUp}
          onRefresh={() => {
            void loadSession(selectedId, true)
            void loadSharedState()
          }}
          onToggleDetails={() => setDetailsOpen((value) => !value)}
          onDecision={onDecision}
        />
      ) : selectedId && (isPending || streaming) ? (
        <div className="flex h-full items-center justify-center text-[12px] text-[#5c5c5c]">
          <div className="mr-2 size-3 animate-spin rounded-full border border-[#2a2a2a] border-t-[#2dd4bf]" />
          {streaming ? "Nova is working…" : "Loading thread…"}
        </div>
      ) : (
        <EmptyHome
          onStart={startThread}
          busy={isPending || streaming}
          model={model}
          provider={provider}
          effort={effort}
          mode={agentMode}
          onModelChange={handleModelChange}
          onEffortChange={setEffort}
          onModeChange={setAgentMode}
          onLocalProjectChange={(workspace) => void handleLocalProjectChange(workspace)}
          localProjectLabel={localProject?.displayName ?? null}
        />
      )}
    </>
  )

  if (view === "settings") {
    return (
      <main className="dark flex h-dvh min-h-[560px] overflow-hidden bg-[#0a0a0a] text-[#e8e8e8]">
        <div className="min-h-0 min-w-0 flex-1">{content}</div>
        {error ? (
          <button
            type="button"
            onClick={() => setError(null)}
            className="absolute bottom-5 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/20 bg-[#1a1010] px-3 py-2 text-left text-[12px] text-red-300 shadow-xl"
          >
            <X className="size-3.5 shrink-0" />
            {error}
          </button>
        ) : null}
      </main>
    )
  }

  return (
    <main className="dark flex h-dvh min-h-[560px] overflow-hidden bg-[#0a0a0a] text-[#e8e8e8]">
      {/* Desktop sidebar — flush left like Capy */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile drawer */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {sidebar}
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="flex-1 bg-black/70 backdrop-blur-sm"
          />
        </div>
      ) : null}

      {/* Main stage: inset rounded panel */}
      <div className="relative flex min-w-0 flex-1 flex-col p-0 md:p-2 md:pl-0">
        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-0 bg-[#0f0f0f] md:rounded-xl md:border md:border-white/[0.06]">
          {/* Mobile top bar */}
          <div className="flex h-11 shrink-0 items-center border-b border-white/[0.05] px-3 md:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex size-8 items-center justify-center rounded-md text-[#5c5c5c] hover:bg-white/[0.04] hover:text-[#a0a0a0]"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </button>
            <div className="ml-2 flex items-center gap-2">
              <NovaMark size="sm" />
              <span className="text-[13px] font-medium">Nova</span>
            </div>
            <button
              type="button"
              className="ml-auto flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-[#a0a0a0]"
            >
              <MessageSquare className="size-3" />
              Chat
            </button>
          </div>

          <div className="min-h-0 flex-1">{content}</div>

          {error ? (
            <button
              type="button"
              onClick={() => setError(null)}
              className="absolute bottom-5 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-lg border border-red-500/20 bg-[#1a1010] px-3 py-2 text-left text-[12px] text-red-300 shadow-xl"
            >
              <X className="size-3.5 shrink-0" />
              {error}
            </button>
          ) : null}
        </section>
      </div>
    </main>
  )
}
