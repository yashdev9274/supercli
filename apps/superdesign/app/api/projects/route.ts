import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/db"
import { requireApiAuth } from "@/lib/auth-guard"

export async function GET() {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const projects = await prisma.designProject.findMany({
    where: { userId: auth.session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { artifacts: true } } },
  })
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const auth = await requireApiAuth()
  if ("error" in auth) return auth.error

  const prisma = getPrisma()
  const body = await req.json()
  const project = await prisma.designProject.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      framework: body.framework ?? "html",
      designSystemId: body.designSystemId ?? null,
      skillId: body.skillId ?? null,
      userId: auth.session.user.id,
    },
  })
  return NextResponse.json(project, { status: 201 })
}
