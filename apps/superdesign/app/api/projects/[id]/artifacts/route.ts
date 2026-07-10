import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth-guard"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const { id } = await params
  const project = await prisma.designProject.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const artifacts = await prisma.artifact.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(artifacts)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const { id } = await params
  const project = await prisma.designProject.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const artifact = await prisma.artifact.create({
    data: {
      projectId: id,
      type: body.type,
      title: body.title ?? null,
      prompt: body.prompt ?? null,
      content: body.content ?? undefined,
      files: body.files ?? undefined,
    },
  })
  return NextResponse.json(artifact, { status: 201 })
}
