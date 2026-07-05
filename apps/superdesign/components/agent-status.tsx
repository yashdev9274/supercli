export function AgentStatus({ label = "Agent running" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 mx-3 mb-2 rounded-[var(--radius)] border border-[var(--primary)]/30 bg-[var(--primary-muted)] animate-[fadeIn_0.2s_ease-out]">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]" />
      </span>
      <span className="text-[11px] font-medium text-[var(--primary)]">{label}</span>
    </div>
  )
}
