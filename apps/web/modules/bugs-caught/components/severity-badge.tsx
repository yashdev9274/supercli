import { cn } from "@/lib/utils"

export function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-zinc-400",
    nit: "text-zinc-400",
    info: "text-blue-400",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-xs font-medium",
        colors[severity] || colors.info,
      )}
    >
      [{severity}]
    </span>
  )
}
