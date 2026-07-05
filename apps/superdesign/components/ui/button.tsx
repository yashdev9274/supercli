import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

const variants = {
  primary: "bg-[var(--primary)] text-white hover:brightness-110 active:brightness-90 shadow-sm font-medium",
  ghost:
    "bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--surface-elevated)] hover:text-[var(--foreground)]",
  danger: "bg-red-600/10 text-red-400 hover:bg-red-600/20",
}

type Variant = keyof typeof variants
type Size = "sm" | "md" | "lg"

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[var(--radius)]",
          "select-none outline-none",
          "transition-[transform,color,background,border-color,opacity] duration-[var(--dur-quick)] ease-[var(--ease-out)]",
          "active:scale-[0.97]",
          "focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          {
            "h-8 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-10 px-5 text-sm": size === "lg",
          },
          variants[variant],
          className,
        )}
        {...props}
      />
    )
  },
)

Button.displayName = "Button"
