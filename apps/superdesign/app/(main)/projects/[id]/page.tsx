import { getPrisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth-guard"
import { notFound } from "next/navigation"
import { DesignStudio } from "@/components/design-studio"

export const dynamic = "force-dynamic"

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireAuth()
  const { id } = await params
  const prisma = getPrisma()
  const project = await prisma.designProject.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      skillId: true,
      designSystemId: true,
      framework: true,
      artifacts: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!project || project.userId !== session.user.id) {
    notFound()
  }

  return (
    <DesignStudio
      projectId={project.id}
      framework={project.framework}
      skillId={project.skillId}
      designSystemId={project.designSystemId}
      artifacts={project.artifacts as unknown as import("@super/design-core").ArtifactRecord[]}
      initialPrompt={project.title}
    />
  )
}
