import type { DesignSystem } from "../types"

export const SHADCN_DESIGN_SYSTEM: DesignSystem = {
  id: "shadcn",
  name: "shadcn/ui",
  description: "Utility-first, accessible design system inspired by shadcn/ui components",
  colors: [
    { hex: "#09090b", rgb: "rgb(9, 9, 11)", usage: "background" },
    { hex: "#18181b", rgb: "rgb(24, 24, 27)", usage: "surface" },
    { hex: "#27272a", rgb: "rgb(39, 39, 42)", usage: "surface-elevated" },
    { hex: "#3f3f46", rgb: "rgb(63, 63, 70)", usage: "border" },
    { hex: "#52525b", rgb: "rgb(82, 82, 91)", usage: "border-light" },
    { hex: "#71717a", rgb: "rgb(113, 113, 122)", usage: "text-tertiary" },
    { hex: "#a1a1aa", rgb: "rgb(161, 161, 170)", usage: "text-secondary" },
    { hex: "#fafafa", rgb: "rgb(250, 250, 250)", usage: "text-primary" },
    { hex: "#fafafa", rgb: "rgb(250, 250, 250)", usage: "accent" },
    { hex: "#e4e4e7", rgb: "rgb(228, 228, 231)", usage: "accent-hover" },
    { hex: "#d4d4d8", rgb: "rgb(212, 212, 216)", usage: "accent-active" },
    { hex: "#fafafa1a", rgb: "rgba(250, 250, 250, 0.1)", usage: "accent-muted" },
    { hex: "#ef4444", rgb: "rgb(239, 68, 68)", usage: "danger" },
    { hex: "#3b82f6", rgb: "rgb(59, 130, 246)", usage: "info" },
    { hex: "#eab308", rgb: "rgb(234, 179, 8)", usage: "warning" },
    { hex: "#22c55e", rgb: "rgb(34, 197, 94)", usage: "success" },
    { hex: "#a855f7", rgb: "rgb(168, 85, 247)", usage: "brand" },
  ],
  typography: {
    family: "Inter, system-ui, -apple-system, sans-serif",
    headingFont: "Inter, system-ui, -apple-system, sans-serif",
    bodyFont: "Inter, system-ui, -apple-system, sans-serif",
    monoFont: "JetBrains Mono, SF Mono, monospace",
    scale: {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
    },
  },
  spacing: {
    unit: 4,
    scale: ["4px", "8px", "12px", "16px", "20px", "24px", "32px", "40px", "48px", "64px"],
  },
  borderRadius: "8px",
  shadow:
    "0 1px 2px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1), 0 4px 12px rgba(0, 0, 0, 0.15)",
  motion: "200ms ease-in-out",
  voice:
    "Clean and precise. Prioritize accessibility and semantic HTML. Use ARIA labels and keyboard navigation by default.",
}
