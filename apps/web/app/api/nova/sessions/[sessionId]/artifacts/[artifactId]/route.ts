import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { headers } from "next/headers"
import { z } from "zod"

import { MAX_PATCH_BYTES } from "@/modules/nova/sandbox/policy"

const metadataSchema = z.object({ userId: z.string(), organizationId: z.string(), patch: z.string(), expiresAt: z.iso.datetime() })
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string; artifactId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user.id) return new Response("Unauthorized", { status: 401 })
  const { sessionId, artifactId } = await context.params
  const artifact = await prisma.novaArtifact.findFirst({ where: { id: artifactId, agentSessionId: sessionId, type: "sandbox_patch" }, include: { agentSession: { select: { organizationId: true } } } })
  const metadata = metadataSchema.safeParse(artifact?.metadata)
  if (!artifact || !metadata.success || metadata.data.userId !== session.user.id || metadata.data.organizationId !== artifact.agentSession.organizationId) return new Response("Not found", { status: 404 })
  const membership = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId: metadata.data.organizationId, userId: session.user.id } }, select: { status: true } })
  if (membership?.status !== "active") return new Response("Not found", { status: 404 })
  if (new Date(metadata.data.expiresAt) <= new Date()) return new Response("Patch expired", { status: 410 })
  if (Buffer.byteLength(metadata.data.patch) > MAX_PATCH_BYTES) return new Response("Patch unavailable", { status: 422 })
  return new Response(metadata.data.patch, { headers: {
    "Content-Type": "text/x-diff; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"nova-changes.patch\"",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } })
}
