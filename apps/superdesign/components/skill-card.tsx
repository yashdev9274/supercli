import type { DesignSkill } from "@super/design-core"

interface SkillCardProps {
  skill: DesignSkill
  selected?: boolean
  onSelect?: () => void
}

const TYPE_BADGES: Record<string, string> = {
  prototype: "Prototype",
  dashboard: "Dashboard",
  deck: "Deck",
  image: "Image",
  hyperframe: "HyperFrame",
}

export function SkillCard({ skill, selected, onSelect }: SkillCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-[var(--radius-lg)] border transition-all duration-[var(--dur-enter)] ease-[var(--ease-out)] active:scale-[0.98] ${
        selected
          ? "border-[var(--primary)] bg-[var(--primary-muted)] shadow-sm"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-light)] hover:bg-[var(--surface-elevated)] hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm text-[var(--foreground)]">{skill.name}</h3>
        <span className="shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
          {TYPE_BADGES[skill.artifactType] ?? skill.artifactType}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)] line-clamp-2">
        {skill.description}
      </p>
    </button>
  )
}
