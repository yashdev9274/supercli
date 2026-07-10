import type { DesignSystem } from "../types"

export const NOTION_DESIGN_SYSTEM: DesignSystem = {
  id: "notion",
  name: "Notion",
  description: "Neutral, unopinionated design system inspired by Notion's block-based editor",
  colors: [
    { hex: "#ffffff", rgb: "rgb(255, 255, 255)", usage: "background" },
    { hex: "#fafafa", rgb: "rgb(250, 250, 250)", usage: "surface" },
    { hex: "#f0f0f0", rgb: "rgb(240, 240, 240)", usage: "surface-elevated" },
    { hex: "#e0e0e0", rgb: "rgb(224, 224, 224)", usage: "border" },
    { hex: "#d0d0d0", rgb: "rgb(208, 208, 208)", usage: "border-light" },
    { hex: "#787878", rgb: "rgb(120, 120, 120)", usage: "text-secondary" },
    { hex: "#37352f", rgb: "rgb(55, 53, 47)", usage: "text-primary" },
    { hex: "#2e7d32", rgb: "rgb(46, 125, 50)", usage: "accent" },
    { hex: "#1b5e20", rgb: "rgb(27, 94, 32)", usage: "accent-hover" },
    { hex: "#2e7d321a", rgb: "rgba(46, 125, 50, 0.1)", usage: "accent-muted" },
    { hex: "#e53935", rgb: "rgb(229, 57, 53)", usage: "danger" },
    { hex: "#1e88e5", rgb: "rgb(30, 136, 229)", usage: "info" },
    { hex: "#fdd835", rgb: "rgb(253, 216, 53)", usage: "warning" },
    { hex: "#e8f5e9", rgb: "rgb(232, 245, 233)", usage: "success-muted" },
  ],
  typography: {
    family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    headingFont: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    bodyFont: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    monoFont: "SF Mono, Monaco, 'Cascadia Code', monospace",
    scale: {
      "xs": "0.75rem",
      "sm": "0.8125rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "2rem",
      "4xl": "2.5rem",
    },
  },
  spacing: {
    unit: 4,
    scale: ["2px", "4px", "6px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"],
  },
  borderRadius: "4px",
  shadow:
    "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.06)",
  motion: "200ms ease",
  voice:
    "Neutral and helpful. Let users organize content their way. Provide structure without imposing opinions. Keep interface text minimal.",
}
