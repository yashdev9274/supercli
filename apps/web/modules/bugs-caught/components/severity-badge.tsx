import { cn } from "@/lib/utils"

export function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "text-red-400 bg-red-400/10 border-red-400/15",
    high: "text-orange-400 bg-orange-400/10 border-orange-400/15",
    medium: "text-yellow-400 bg-yellow-400/10 border-yellow-400/15",
    low: "text-zinc-400 bg-zinc-400/10 border-zinc-400/15",
    nit: "text-zinc-400 bg-zinc-400/10 border-zinc-400/15",
    info: "text-blue-400 bg-blue-400/10 border-blue-400/15",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold lowercase",
        colors[severity] || colors.info,
      )}
    >
      {severity}
    </span>
  )
}
