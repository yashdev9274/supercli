import { NextResponse } from "next/server"
import { streamText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { buildSystemPrompt, listSkills } from "@super/design-core"
import type { Framework } from "@super/design-core"
import { getPrisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth-guard"

export const maxDuration = 120

const CONCENTRATE_BASE = "https://api.concentrate.ai/v1"
const CONCENTRATE_KEY = process.env.CONCENTRATEAI_API_KEY || ""

const concentrate = createOpenAICompatible({
  name: "concentrate",
  baseURL: CONCENTRATE_BASE,
  headers: { Authorization: `Bearer ${CONCENTRATE_KEY}` },
})

const DEFAULT_MODEL = "deepseek-v4-flash"

async function nonStreamingFallback(
  model: string,
  system: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${CONCENTRATE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONCENTRATE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      stream: false,
    }),
    signal,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "unknown error")
    throw new Error(`ConcentrateAI API ${res.status}: ${err}`)
  }

  const json = await res.json()
  return json?.choices?.[0]?.message?.content ?? ""
}

function stripCodeFences(content: string): string {
  const fenceRe = /^\s*```[a-zA-Z0-9_-]*\s*$/
  const lines = content.split("\n")
  const result: string[] = []
  let inFence = false

  for (const line of lines) {
    if (fenceRe.test(line)) {
      inFence = !inFence
      continue
    }
    result.push(line)
  }

  return inFence ? result.join("\n") : content
}

function parseFiles(content: string): {
  files?: Record<string, string>
  html?: string
} {
  const cleaned = stripCodeFences(content)
  const html: string[] = []
  const files: Record<string, string> = {}
  let currentFile: string | null = null
  let currentContent: string[] = []
  let inPreview = false
  const previewLines: string[] = []

  for (const line of cleaned.split("\n")) {
    const fileMatch = line.match(/^---FILE:\s*(\S+)\s*---$/)
    if (fileMatch) {
      if (currentFile) {
        files[currentFile] = currentContent.join("\n")
      }
      currentFile = fileMatch[1]
      currentContent = []
      continue
    }

    const previewMatch = line.match(/^---PREVIEW---$/)
    if (previewMatch) {
      if (currentFile) {
        files[currentFile] = currentContent.join("\n")
        currentFile = null
        currentContent = []
      }
      inPreview = true
      continue
    }

    if (inPreview) {
      previewLines.push(line)
    } else if (currentFile) {
      currentContent.push(line)
    } else {
      html.push(line)
    }
  }

  if (currentFile) {
    files[currentFile] = currentContent.join("\n")
  }

  const previewHtml = previewLines.join("\n").trim()

  return {
    files: Object.keys(files).length > 0 ? files : undefined,
    html: previewHtml || html.join("\n").trim() || undefined,
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAuth()
    if ("error" in auth) return auth.error

    const { id } = await params
    const body = await req.json()
    const { skillId, designSystemId, prompt, model } = body

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 })
    }

    const prisma = getPrisma()
    const project = await prisma.designProject.findUnique({
      where: { id },
      select: {
        userId: true,
        skillId: true,
        designSystemId: true,
        framework: true,
      },
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    if (project.userId !== auth.session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const resolvedSkillId = skillId ?? project.skillId ?? "landing-page"
    const resolvedSystemId =
      designSystemId ?? project.designSystemId ?? "shadcn"
    const framework = (project.framework ?? "html") as Framework
    const modelName = model ?? DEFAULT_MODEL

    const systemPrompt = buildSystemPrompt({
      skillId: resolvedSkillId,
      designSystemId: resolvedSystemId,
      userPrompt: prompt,
      framework,
    })

    const { textStream } = streamText({
      model: concentrate.chatModel(modelName),
      system: systemPrompt,
      prompt,
    })

    const encoder = new TextEncoder()

    const bodyStream = new ReadableStream({
      async start(controller) {
        const chunks: string[] = []

        try {
          for await (const chunk of textStream) {
            chunks.push(chunk)
            controller.enqueue(encoder.encode(chunk))
          }
        } catch (err) {
          console.error("[generate] stream error", err)
          controller.error(err)
          return
        }

        let html = chunks.join("")

        // ConcentrateAI streaming proxy intermittently drops content
        if (!html.trim()) {
          console.log("[generate] empty stream, falling back to non-streaming")
          try {
            html = await nonStreamingFallback(modelName, systemPrompt, prompt)
            controller.enqueue(encoder.encode(html))
          } catch (err) {
            console.error("[generate] fallback failed", err)
            controller.error(err)
            return
          }
        }

        try {
          const skill = listSkills().find((s) => s.id === resolvedSkillId)
          const parsed = parseFiles(html)
          await prisma.artifact.create({
            data: {
              projectId: id,
              type: skill?.artifactType ?? "PROTOTYPE",
              title: prompt.slice(0, 80),
              prompt,
              content: {
                framework,
                files: parsed.files,
                html: parsed.html,
              },
            },
          })
        } catch (dbErr) {
          console.error("[generate] failed to save artifact", dbErr)
        }

        controller.close()
      },
    })

    return new Response(bodyStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (err) {
    console.error("[generate] unexpected error", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    )
  }
}
