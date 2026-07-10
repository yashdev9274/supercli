import { getPrisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth-guard"
import { ProjectCard } from "@/components/project-card"
import { Button } from "@/components/ui/button"
import { Plus, LayoutDashboard } from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function ProjectsPage() {
  const session = await requireAuth()
  const prisma = getPrisma()
  const projects = await prisma.designProject.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { artifacts: true } } },
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8 animate-[fadeSlideUp_0.3s_ease-out]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Your design projects
          </p>
        </div>
        <Link href="/projects/new">
          <Button variant="primary">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center animate-[fadeIn_0.3s_ease-out]">
          <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center mb-4 opacity-50">
            <LayoutDashboard className="w-6 h-6 text-[var(--muted-foreground)]" />
          </div>
          <h2 className="text-lg font-medium mb-2">No projects yet</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Create your first design project to get started
          </p>
          <Link href="/projects/new">
            <Button variant="primary">
              <Plus className="w-4 h-4" />
              Create Project
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project, i) => (
            <div
              key={project.id}
              className="animate-[fadeSlideUp_0.3s_ease-out]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <ProjectCard
                id={project.id}
                title={project.title}
                description={project.description}
                artifactCount={project._count.artifacts}
                updatedAt={project.updatedAt.toISOString()}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
