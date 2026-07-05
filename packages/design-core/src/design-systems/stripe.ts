import type { DesignSystem } from "../types"

export const STRIPE_DESIGN_SYSTEM: DesignSystem = {
  id: "stripe",
  name: "Stripe",
  description: "Purple-blue gradient, clean and professional design system inspired by Stripe",
  colors: [
    { hex: "#0a0a1a", rgb: "rgb(10, 10, 26)", usage: "background" },
    { hex: "#12122a", rgb: "rgb(18, 18, 42)", usage: "surface" },
    { hex: "#1a1a3e", rgb: "rgb(26, 26, 62)", usage: "surface-elevated" },
    { hex: "#2a2a5a", rgb: "rgb(42, 42, 90)", usage: "border" },
    { hex: "#3a3a7a", rgb: "rgb(58, 58, 122)", usage: "border-light" },
    { hex: "#8888bb", rgb: "rgb(136, 136, 187)", usage: "text-secondary" },
    { hex: "#e0e0ff", rgb: "rgb(224, 224, 255)", usage: "text-primary" },
    { hex: "#8a5cf5", rgb: "rgb(138, 92, 245)", usage: "accent" },
    { hex: "#7c4fef", rgb: "rgb(124, 79, 239)", usage: "accent-hover" },
    { hex: "#6e42e0", rgb: "rgb(110, 66, 224)", usage: "accent-active" },
    { hex: "#8a5cf51a", rgb: "rgba(138, 92, 245, 0.1)", usage: "accent-muted" },
    { hex: "#ff6b6b", rgb: "rgb(255, 107, 107)", usage: "danger" },
    { hex: "#4fc3f7", rgb: "rgb(79, 195, 247)", usage: "info" },
    { hex: "#ffd54f", rgb: "rgb(255, 213, 79)", usage: "warning" },
    { hex: "#635bff", rgb: "rgb(99, 91, 255)", usage: "brand" },
    { hex: "#00d4aa", rgb: "rgb(0, 212, 170)", usage: "success" },
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
      "5xl": "3rem",
      "6xl": "3.75rem",
    },
  },
  spacing: {
    unit: 4,
    scale: ["2px", "4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px", "96px"],
  },
  borderRadius: "12px",
  shadow:
    "0 1px 3px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3), 0 12px 48px rgba(138, 92, 245, 0.1)",
  motion: "250ms cubic-bezier(0.4, 0, 0.2, 1)",
  voice:
    "Professional, trustworthy, and helpful. Use plain language over legal jargon. When something goes wrong, explain why and how to fix it.",
}
