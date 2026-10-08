export type WorkingStepKind =
  | "status"
  | "thinking"
  | "tool"
  | "read"
  | "write"
  | "explore"
  | "activity"

export type WorkingStep = {
  id: string
  kind: WorkingStepKind
  label: string
  status: "active" | "done"
  startedAt: number
  endedAt?: number
  /** Optional nested lines (e.g. files under "Exploring N files"). */
  children?: WorkingStepChild[]
  meta?: {
    path?: string
    language?: string
    additions?: number
    deletions?: number
    durationMs?: number
  }
}

export type WorkingStepChild = {
  id: string
  label: string
  path?: string
  language?: string
  range?: string
}

export function formatWorkDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function languageFromPath(path: string): string {
  const base = path.split("/").pop() ?? path
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : ""
  if (ext === "tsx") return "tsx"
  if (ext === "ts" || ext === "mts" || ext === "cts") return "ts"
  if (ext === "jsx") return "jsx"
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "js"
  if (ext === "css" || ext === "scss") return "css"
  if (ext === "json") return "json"
  if (ext === "md" || ext === "mdx") return "md"
  if (ext === "py") return "py"
  if (ext === "go") return "go"
  if (ext === "rs") return "rs"
  if (ext === "swift") return "swift"
  return ext || "file"
}

function newId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12)
}

function finishActive(steps: WorkingStep[], now: number, kinds?: WorkingStepKind[]): WorkingStep[] {
  return steps.map((step) => {
    if (step.status !== "active") return step
    if (kinds && !kinds.includes(step.kind)) return step
    return {
      ...step,
      status: "done" as const,
      endedAt: step.endedAt ?? now,
      label: finalizeLabel(step, now),
    }
  })
}

function finalizeLabel(step: WorkingStep, now: number): string {
  if (step.kind === "thinking") {
    const ms = (step.endedAt ?? now) - step.startedAt
    return `Thought for ${formatWorkDuration(ms)}`
  }
  return step.label
    .replace(/^Thinking for /, "Thought for ")
    .replace(/\s*…$/, "")
}

function upsertStatus(steps: WorkingStep[], message: string, now: number): WorkingStep[] {
  const label = humanizeStatus(message)
  if (!label) return steps

  // Collapse rapid status spam: update last status if still active.
  const last = steps[steps.length - 1]
  if (last?.kind === "status" && last.status === "active") {
    return [
      ...steps.slice(0, -1),
      { ...last, label, startedAt: last.startedAt },
    ]
  }

  const closed = finishActive(steps, now, ["status", "thinking"])
  return [
    ...closed,
    {
      id: newId(),
      kind: "status",
      label,
      status: "active",
      startedAt: now,
    },
  ]
}

function humanizeStatus(message: string): string | null {
  const raw = message.trim()
  if (!raw) return null
  const lower = raw.toLowerCase()

  if (lower === "request accepted" || lower === "accepted") return "Accepted request"
  if (lower.includes("plan_gate") || lower.includes("plan limits")) return "Checking plan limits"
  if (lower.includes("budget")) return "Checking usage budget"
  if (lower.startsWith("harness")) {
    const bits = raw.split("·").map((s) => s.trim()).filter(Boolean)
    if (bits.length >= 3) return `Routing · ${bits[1]} · ${bits[2]}`
    return raw.replace(/^Harness\s*·\s*/i, "Routing · ")
  }
  if (lower.startsWith("connected tool")) {
    return raw.replace(/^Connected tool\s*·\s*/i, "Using tool · ")
  }
  if (lower === "starting…" || lower === "starting") return "Starting"
  if (lower === "working") return null
  // Drop very long reasoning dumps from status channel
  if (raw.length > 140) return raw.slice(0, 120).trimEnd() + "…"
  return raw.replace(/\s*…$/, "")
}

function ensureThinking(steps: WorkingStep[], now: number): WorkingStep[] {
  const last = steps[steps.length - 1]
  if (last?.kind === "thinking" && last.status === "active") {
    return steps.map((step, i) =>
      i === steps.length - 1
        ? {
            ...step,
            label: `Thinking for ${formatWorkDuration(now - step.startedAt)}`,
          }
        : step,
    )
  }
  const closed = finishActive(steps, now, ["status", "thinking"])
  return [
    ...closed,
    {
      id: newId(),
      kind: "thinking",
      label: "Thinking for 0s",
      status: "active",
      startedAt: now,
    },
  ]
}

function parseToolActivity(title: string | null | undefined, body: string | null | undefined): WorkingStep {
  const now = Date.now()
  const name = (title || "tool").trim()
  const detail = (body || "").trim()
  const writeMatch = detail.match(/wrote\s+([^\s]+)/i) || name.match(/write[_\s-]?file/i)
  const readMatch = detail.match(/read(?:ing)?\s+([^\s]+)/i) || name.match(/read[_\s-]?file/i)
  const path =
    detail.match(/(?:^|[\s`"'])([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})/)?.[1]
    || name.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})/)?.[1]

  if (writeMatch || /write|edit|create/i.test(name)) {
    const filePath = path || "file"
    const add = detail.match(/\+(\d+)/)?.[1]
    const del = detail.match(/-(\d+)/)?.[1]
    return {
      id: newId(),
      kind: "write",
      label: `Writing`,
      status: "done",
      startedAt: now,
      endedAt: now,
      meta: {
        path: filePath,
        language: languageFromPath(filePath),
        additions: add ? Number(add) : undefined,
        deletions: del ? Number(del) : undefined,
      },
    }
  }

  if (readMatch || /read|inspect|explore/i.test(name)) {
    const filePath = path || undefined
    return {
      id: newId(),
      kind: filePath ? "read" : "explore",
      label: filePath ? "Reading" : (detail || name || "Explored"),
      status: "done",
      startedAt: now,
      endedAt: now,
      meta: filePath
        ? { path: filePath, language: languageFromPath(filePath) }
        : undefined,
    }
  }

  return {
    id: newId(),
    kind: "tool",
    label: detail || `Tool · ${name}`,
    status: "done",
    startedAt: now,
    endedAt: now,
  }
}

export function reduceWorkingSteps(
  steps: WorkingStep[],
  event:
    | { type: "status"; message: string }
    | { type: "reasoning"; content: string }
    | { type: "text" }
    | {
        type: "activity"
        activity: { type: string; title?: string | null; body?: string | null; status?: string }
      }
    | { type: "tick"; now: number },
): WorkingStep[] {
  const now = Date.now()

  if (event.type === "tick") {
    return steps.map((step) => {
      if (step.status !== "active" || step.kind !== "thinking") return step
      return {
        ...step,
        label: `Thinking for ${formatWorkDuration(event.now - step.startedAt)}`,
      }
    })
  }

  if (event.type === "status") {
    return upsertStatus(steps, event.message, now)
  }

  if (event.type === "reasoning") {
    if (!event.content.trim()) return steps
    return ensureThinking(steps, now)
  }

  if (event.type === "text") {
    return finishActive(steps, now)
  }

  if (event.type === "activity") {
    const closed = finishActive(steps, now)
    if (event.activity.type === "response" || event.activity.type === "error") {
      return closed
    }
    if (event.activity.type === "acknowledgement") {
      return closed
    }
    const step = parseToolActivity(event.activity.title, event.activity.body)
    // Merge consecutive reads into an explore group
    if (step.kind === "read" && step.meta?.path) {
      const last = closed[closed.length - 1]
      if (last?.kind === "explore" && last.children) {
        const child: WorkingStepChild = {
          id: newId(),
          label: "Reading",
          path: step.meta.path,
          language: step.meta.language,
        }
        return [
          ...closed.slice(0, -1),
          {
            ...last,
            label: `Exploring ${last.children.length + 1} files`,
            children: [...last.children, child],
          },
        ]
      }
      if (last?.kind === "read" && last.meta?.path) {
        const first: WorkingStepChild = {
          id: last.id,
          label: "Reading",
          path: last.meta.path,
          language: last.meta.language,
        }
        const second: WorkingStepChild = {
          id: newId(),
          label: "Reading",
          path: step.meta.path,
          language: step.meta.language,
        }
        return [
          ...closed.slice(0, -1),
          {
            id: newId(),
            kind: "explore",
            label: "Exploring 2 files",
            status: "done",
            startedAt: last.startedAt,
            endedAt: now,
            children: [first, second],
          },
        ]
      }
    }
    return [...closed, step]
  }

  return steps
}

export function tickWorkingSteps(steps: WorkingStep[], now = Date.now()): WorkingStep[] {
  return reduceWorkingSteps(steps, { type: "tick", now })
}
