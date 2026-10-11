import { cn } from "@/lib/utils"

/**
 * Nova / Supercode desktop dock mark — same asset as supercode-desktop AppIcon.
 */
export function NovaIcon({
  size = "md",
  className,
  alt = "Nova",
}: {
  size?: "sm" | "md" | "lg"
  className?: string
  alt?: string
}) {
  const dim = size === "sm" ? "size-5" : size === "lg" ? "size-9" : "size-7"
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/nova-icon.png"
      alt={alt}
      width={size === "sm" ? 20 : size === "lg" ? 36 : 28}
      height={size === "sm" ? 20 : size === "lg" ? 36 : 28}
      draggable={false}
      className={cn(dim, "shrink-0 select-none object-contain", className)}
    />
  )
}
