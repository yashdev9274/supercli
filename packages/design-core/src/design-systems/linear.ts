import type { DesignSystem } from "../types"

export const LINEAR_DESIGN_SYSTEM: DesignSystem = {
  id: "linear",
  name: "Linear",
  description: "Dark-first, green-accented design system inspired by Linear's issue tracking app",
  colors: [
    { hex: "#0a0a0b", rgb: "rgb(10, 10, 11)", usage: "background" },
    { hex: "#141416", rgb: "rgb(20, 20, 22)", usage: "surface" },
    { hex: "#1c1c1f", rgb: "rgb(28, 28, 31)", usage: "surface-elevated" },
    { hex: "#27272a", rgb: "rgb(39, 39, 42)", usage: "border" },
    { hex: "#3f3f46", rgb: "rgb(63, 63, 70)", usage: "border-light" },
    { hex: "#a1a1aa", rgb: "rgb(161, 161, 170)", usage: "text-secondary" },
    { hex: "#f4f4f5", rgb: "rgb(244, 244, 245)", usage: "text-primary" },
    { hex: "#00e599", rgb: "rgb(0, 229, 153)", usage: "accent" },
    { hex: "#00cc88", rgb: "rgb(0, 204, 136)", usage: "accent-hover" },
    { hex: "#00b377", rgb: "rgb(0, 179, 119)", usage: "accent-active" },
    { hex: "#00e5991a", rgb: "rgba(0, 229, 153, 0.1)", usage: "accent-muted" },
    { hex: "#f0435c", rgb: "rgb(240, 67, 92)", usage: "danger" },
    { hex: "#5b8af5", rgb: "rgb(91, 138, 245)", usage: "info" },
    { hex: "#f5a623", rgb: "rgb(245, 166, 35)", usage: "warning" },
  ],
  typography: {
    family: "Inter, system-ui, -apple-system, sans-serif",
    headingFont: "Inter, system-ui, -apple-system, sans-serif",
    bodyFont: "Inter, system-ui, -apple-system, sans-serif",
    monoFont: "JetBrains Mono, SF Mono, monospace",
    scale: {
      "xs": "0.75rem",
      "sm": "0.8125rem",
      "base": "0.875rem",
      "lg": "0.9375rem",
      "xl": "1rem",
      "2xl": "1.125rem",
      "3xl": "1.5rem",
      "4xl": "2rem",
    },
  },
  spacing: {
    unit: 4,
    scale: ["4px", "8px", "12px", "16px", "20px", "24px", "32px", "40px", "48px", "64px"],
  },
  borderRadius: "8px",
  shadow:
    "0 0 0 1px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.1), 0 8px 16px rgba(0, 0, 0, 0.1)",
  motion: "200ms cubic-bezier(0.16, 1, 0.3, 1)",
  voice:
    "Clear, direct, and minimal. Use concise labels and avoid jargon. Error messages should be helpful and specific.",
}
