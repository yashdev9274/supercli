import type { DesignSystem } from "@super/design-core"

interface DesignSystemCardProps {
  system: DesignSystem
  selected?: boolean
  onSelect?: () => void
}

export function DesignSystemCard({ system, selected, onSelect }: DesignSystemCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-[var(--radius-lg)] border transition-all duration-[var(--dur-enter)] ease-[var(--ease-out)] active:scale-[0.98] ${
        selected
          ? "border-[var(--primary)] bg-[var(--primary-muted)] shadow-sm"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-light)] hover:bg-[var(--surface-elevated)] hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        {system.colors.slice(0, 4).map((c) => (
          <span
            key={c.hex}
            className="w-5 h-5 rounded-full border border-[var(--border)] transition-transform duration-[var(--dur-quick)] group-hover:scale-110"
            style={{ background: c.hex }}
            title={c.usage}
          />
        ))}
      </div>
      <h3 className="font-medium text-sm text-[var(--foreground)]">{system.name}</h3>
      <p className="mt-1 text-xs text-[var(--muted-foreground)] line-clamp-2">
        {system.description}
      </p>
      <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">
        {system.typography.family.split(",")[0]}
      </div>
    </button>
  )
}
