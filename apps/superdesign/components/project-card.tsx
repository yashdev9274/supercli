import Link from "next/link"

interface ProjectCardProps {
  id: string
  title: string
  description?: string | null
  artifactCount: number
  updatedAt: string
}

export function ProjectCard({ id, title, description, artifactCount, updatedAt }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${id}`}
      className="block p-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-elevated)] hover:border-[var(--border-light)] hover:shadow-md transition-all duration-[var(--dur-enter)] ease-[var(--ease-out)] active:scale-[0.99] group"
    >
      <h3 className="font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors duration-[var(--dur-quick)]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-[var(--muted-foreground)] line-clamp-2">
          {description}
        </p>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <span>{artifactCount} artifact{artifactCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{new Date(updatedAt).toLocaleDateString()}</span>
      </div>
    </Link>
  )
}
