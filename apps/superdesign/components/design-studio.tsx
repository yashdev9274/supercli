"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import type { ArtifactRecord, Framework } from "@super/design-core"
import { FRAMEWORKS } from "@super/design-core"
import { ArtifactPreview } from "./artifact-preview"
import { AgentStatus } from "./agent-status"
import { Button } from "@/components/ui/button"
import { Square, Sparkles } from "lucide-react"

function extractPreviewHtml(raw: string): string {
  const fenceRe = /^\s*```[a-zA-Z0-9_-]*\s*$/
  const lines = raw.split("\n")
  const cleaned: string[] = []
  let inFence = false
  for (const line of lines) {
    if (fenceRe.test(line)) {
      inFence = !inFence
      continue
    }
    cleaned.push(line)
  }
  const text = inFence ? raw : cleaned.join("\n")

  const previewIdx = text.indexOf("---PREVIEW---")
  if (previewIdx !== -1) {
    return text.slice(previewIdx + "---PREVIEW---".length).trim()
  }

  if (text.includes("---FILE:")) {
    return ""
  }

  return text.trim()
}

interface DesignStudioProps {
  projectId: string
  framework?: string | null
  skillId?: string | null
  designSystemId?: string | null
  artifacts: ArtifactRecord[]
  initialPrompt?: string | null
}

async function generateArtifact(
  projectId: string,
  input: string,
  onChunk: (text: string) => void,
  signal: AbortSignal,
) {
  const res = await fetch(`/api/projects/${projectId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`Generation failed: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let accumulated = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += decoder.decode(value, { stream: true })
    onChunk(accumulated)
  }
}

async function refreshArtifacts(projectId: string) {
  const res = await fetch(`/api/projects/${projectId}`)
  return res.json()
}

export function DesignStudio({
  projectId,
  framework: frameworkId,
  artifacts: initialArtifacts,
  initialPrompt,
}: DesignStudioProps) {
  const framework = FRAMEWORKS.find((f) => f.id === (frameworkId as Framework))
  const [prompt, setPrompt] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>(initialArtifacts)
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRecord | null>(
    initialArtifacts[0] ?? null
  )
  const [liveHtml, setLiveHtml] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const runGeneration = useCallback(async (input: string) => {
    if (!input.trim() || streamingRef.current) return
    streamingRef.current = true
    setStreaming(true)
    setLiveHtml("")

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await generateArtifact(projectId, input.trim(), (text) => {
        setLiveHtml(text)
      }, controller.signal)

      setPrompt("")

      const project = await refreshArtifacts(projectId)
      setArtifacts(project.artifacts ?? [])
      if (project.artifacts?.length > 0) {
        setSelectedArtifact(project.artifacts[0])
      }
    } catch (err) {
      if (controller.signal.aborted) return
      console.error("Generation failed", err)
    } finally {
      streamingRef.current = false
      setStreaming(false)
      abortRef.current = null
      setLiveHtml(null)
    }
  }, [projectId])

  const handleGenerate = useCallback(() => {
    runGeneration(prompt)
  }, [runGeneration, prompt])

  useEffect(() => {
    if (initialPrompt && artifacts.length === 0) {
      runGeneration(initialPrompt)
    }
    // Only on mount when there are no artifacts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-[var(--border)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)] space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Artifacts
          </h2>
          {framework && (
            <div className="text-[10px] font-medium text-[var(--primary)]">
              {framework.name}
            </div>
          )}
        </div>
        {streaming && <AgentStatus />}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedArtifact(a)}
              className={`w-full text-left p-3 rounded-[var(--radius)] border text-sm transition-all duration-[var(--dur-quick)] ease-[var(--ease-out)] active:scale-[0.98] ${
                selectedArtifact?.id === a.id
                  ? "border-[var(--primary)] bg-[var(--primary-muted)]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-light)]"
              }`}
            >
              <div className="font-medium truncate">{a.title ?? "Untitled"}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mt-1">
                {a.type}
              </div>
            </button>
          ))}
          {artifacts.length === 0 && !streaming && (
            <p className="text-xs text-[var(--muted-foreground)] text-center py-8">
              No artifacts yet. Write a prompt below to generate one.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 bg-white relative">
          <ArtifactPreview
            html={
              streaming && liveHtml
                ? extractPreviewHtml(liveHtml)
                : (selectedArtifact?.content as { html?: string } | null)?.html ?? null
            }
            content={
              !streaming
                ? (selectedArtifact?.content as {
                    framework?: string
                    files?: Record<string, string>
                    html?: string
                  } | null) ?? undefined
                : undefined
            }
          />
        </div>

        <div className="border-t border-[var(--border)] p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleGenerate()
                }
              }}
              placeholder="Describe what you want to design..."
              className="flex-1 px-3 py-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none focus:border-[var(--primary)] transition-[border-color,box-shadow] duration-[var(--dur-quick)] focus:shadow-[0_0_0_1px_var(--primary-muted)]"
              disabled={streaming}
            />
            {streaming ? (
              <Button variant="danger" onClick={handleStop}>
                <Square className="w-3.5 h-3.5" />
                Stop
              </Button>
            ) : (
              <Button variant="primary" onClick={handleGenerate} disabled={!prompt.trim()}>
                <Sparkles className="w-3.5 h-3.5" />
                Generate
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
