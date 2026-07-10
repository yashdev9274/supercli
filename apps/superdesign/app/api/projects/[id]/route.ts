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
    include: {
      artifacts: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  return NextResponse.json(project)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const { id } = await params
  const project = await prisma.designProject.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const updated = await prisma.designProject.update({
    where: { id },
    data: {
      title: body.title,
      description: body.description,
      designSystemId: body.designSystemId,
      skillId: body.skillId,
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const { id } = await params
  const project = await prisma.designProject.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.userId !== auth.session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.designProject.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
