import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import prisma from "@super/db"
import { novaFeedbackEnvelopeSchema } from "@super/nova"

import {
  attachNovaFeedbackUserFeedback,
  closeoutNovaFeedback,
  ingestNovaFeedbackBatch,
  openNovaFeedback,
} from "@/modules/nova/feedback/service"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type AuthOutcome =
  | { authenticated: true; organizationId: string | null; userId: string | null }
  | { authenticated: false; reason: "unauthorized" | "forbidden" }

async function authorize(request: NextRequest): Promise<AuthOutcome> {
  const headerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  const envToken = process.env.NOVA_FEEDBACK_TOKEN?.trim()
  if (headerToken && envToken && headerToken === envToken) {
    return { authenticated: true, organizationId: null, userId: null }
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return { authenticated: false, reason: "unauthorized" }
    return { authenticated: true, organizationId: null, userId: session.user.id }
  } catch {
    return { authenticated: false, reason: "unauthorized" }
  }
}

export async function POST(request: NextRequest) {
  return withAcceptLanguage(request, async () => {
    const authResult = await authorize(request)
    if (!authResult.authenticated) {
      return NextResponse.json({ error: authResult.reason }, { status: 401 })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 })
    }
    const parsed = novaFeedbackEnvelopeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_envelope", issues: parsed.error.issues.slice(0, 20) },
        { status: 400 },
      )
    }
    const envelope = parsed.data
    switch (envelope.kind) {
      case "open": {
        if (!envelope.organizationId) {
          return NextResponse.json({ error: "missing_organization_id" }, { status: 400 })
        }
        const result = await openNovaFeedback(envelope)
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, kind: envelope.kind },
            { status: 502 },
          )
        }
        return NextResponse.json(
          { feedbackId: result.feedbackId, kind: envelope.kind },
          { status: 201 },
        )
      }
      case "batch": {
        const result = await ingestNovaFeedbackBatch(envelope)
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, kind: envelope.kind },
            { status: 404 },
          )
        }
        return NextResponse.json(
          { feedbackId: result.feedbackId, kind: envelope.kind, accepted: envelope.events.length },
          { status: 202 },
        )
      }
      case "closeout": {
        const result = await closeoutNovaFeedback(envelope)
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, kind: envelope.kind },
            { status: 404 },
          )
        }
        return NextResponse.json(
          { feedbackId: result.feedbackId, kind: envelope.kind },
          { status: 200 },
        )
      }
      case "user_feedback": {
        const result = await attachNovaFeedbackUserFeedback(envelope)
        if (!result.ok) {
          return NextResponse.json(
            { error: result.error, kind: envelope.kind },
            { status: 404 },
          )
        }
        return NextResponse.json(
          { feedbackId: result.feedbackId, kind: envelope.kind },
          { status: 200 },
        )
      }
      default: {
        const _exhaustive: never = envelope
        return NextResponse.json({ error: "unsupported_kind" }, { status: 400 })
      }
    }
  })
}

export async function GET(request: NextRequest) {
  return withAcceptLanguage(request, async () => {
    const authResult = await authorize(request)
    if (!authResult.authenticated) {
      return NextResponse.json({ error: authResult.reason }, { status: 401 })
    }
    const id = request.nextUrl.searchParams.get("id")
    if (!id) {
      try {
        const rows = await prisma.novaFeedback.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
            issueUrl: true,
            createdAt: true,
          },
        })
        return NextResponse.json({ feedback: rows }, { status: 200 })
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "list_failed" },
          { status: 500 },
        )
      }
    }
    const row = await prisma.novaFeedback.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        agentSessionId: true,
        runId: true,
        kind: true,
        severity: true,
        title: true,
        summary: true,
        body: true,
        filePath: true,
        userRating: true,
        userComment: true,
        metadata: true,
        status: true,
        issueNumber: true,
        issueUrl: true,
        promotedAt: true,
        createdAt: true,
        updatedAt: true,
        closedAt: true,
      },
    })
    if (!row) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }
    return NextResponse.json({ feedback: row }, { status: 200 })
  })
}

async function withAcceptLanguage(request: NextRequest, handler: () => Promise<Response>) {
  return handler()
}
