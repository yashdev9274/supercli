import type { DesignSystem } from "../types"

export const VERCEL_DESIGN_SYSTEM: DesignSystem = {
  id: "vercel",
  name: "Vercel",
  description: "Geometric, high-contrast design system inspired by Vercel's dashboard",
  colors: [
    { hex: "#000000", rgb: "rgb(0, 0, 0)", usage: "background" },
    { hex: "#0a0a0a", rgb: "rgb(10, 10, 10)", usage: "surface" },
    { hex: "#111111", rgb: "rgb(17, 17, 17)", usage: "surface-elevated" },
    { hex: "#1a1a1a", rgb: "rgb(26, 26, 26)", usage: "border" },
    { hex: "#333333", rgb: "rgb(51, 51, 51)", usage: "border-light" },
    { hex: "#666666", rgb: "rgb(102, 102, 102)", usage: "text-tertiary" },
    { hex: "#999999", rgb: "rgb(153, 153, 153)", usage: "text-secondary" },
    { hex: "#ffffff", rgb: "rgb(255, 255, 255)", usage: "text-primary" },
    { hex: "#ffffff", rgb: "rgb(255, 255, 255)", usage: "accent" },
    { hex: "#e8e8e8", rgb: "rgb(232, 232, 232)", usage: "accent-hover" },
    { hex: "#1a1a1a", rgb: "rgb(26, 26, 26)", usage: "accent-active" },
    { hex: "#ffffff1a", rgb: "rgba(255, 255, 255, 0.1)", usage: "accent-muted" },
    { hex: "#ff4444", rgb: "rgb(255, 68, 68)", usage: "danger" },
    { hex: "#5a5af5", rgb: "rgb(90, 90, 245)", usage: "info" },
    { hex: "#f5a623", rgb: "rgb(245, 166, 35)", usage: "warning" },
  ],
  typography: {
    family: "Geist, system-ui, -apple-system, sans-serif",
    headingFont: "Geist, system-ui, -apple-system, sans-serif",
    bodyFont: "Geist, system-ui, -apple-system, sans-serif",
    monoFont: "Geist Mono, SF Mono, monospace",
    scale: {
      "xs": "0.75rem",
      "sm": "0.875rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "2rem",
      "4xl": "2.5rem",
      "5xl": "3.5rem",
    },
  },
  spacing: {
    unit: 8,
    scale: ["8px", "16px", "24px", "32px", "40px", "48px", "64px", "80px", "96px", "128px"],
  },
  borderRadius: "6px",
  shadow:
    "0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.4)",
  motion: "150ms ease",
  voice:
    "Technical and precise. Use developer-friendly terminology. Error messages should include actionable steps and reference IDs.",
}
