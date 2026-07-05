import type { DesignSystem } from "../types"

export const APPLE_DESIGN_SYSTEM: DesignSystem = {
  id: "apple",
  name: "Apple",
  description: "Minimal, white-space-forward design system inspired by Apple's design language",
  colors: [
    { hex: "#ffffff", rgb: "rgb(255, 255, 255)", usage: "background" },
    { hex: "#f5f5f7", rgb: "rgb(245, 245, 247)", usage: "surface" },
    { hex: "#e8e8ed", rgb: "rgb(232, 232, 237)", usage: "surface-elevated" },
    { hex: "#d2d2d7", rgb: "rgb(210, 210, 215)", usage: "border" },
    { hex: "#c6c6c8", rgb: "rgb(198, 198, 200)", usage: "border-light" },
    { hex: "#86868b", rgb: "rgb(134, 134, 139)", usage: "text-secondary" },
    { hex: "#1d1d1f", rgb: "rgb(29, 29, 31)", usage: "text-primary" },
    { hex: "#0071e3", rgb: "rgb(0, 113, 227)", usage: "accent" },
    { hex: "#0066cc", rgb: "rgb(0, 102, 204)", usage: "accent-hover" },
    { hex: "#0055b3", rgb: "rgb(0, 85, 179)", usage: "accent-active" },
    { hex: "#0071e31a", rgb: "rgba(0, 113, 227, 0.1)", usage: "accent-muted" },
    { hex: "#ff3b30", rgb: "rgb(255, 59, 48)", usage: "danger" },
    { hex: "#34c759", rgb: "rgb(52, 199, 89)", usage: "success" },
    { hex: "#ff9500", rgb: "rgb(255, 149, 0)", usage: "warning" },
  ],
  typography: {
    family:
      "-apple-system, BlinkMacSystemFont, 'SF Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif",
    headingFont:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif",
    bodyFont:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
    monoFont: "'SF Mono', 'SFMono-Regular', monospace",
    scale: {
      "xs": "0.75rem",
      "sm": "0.8125rem",
      "base": "1rem",
      "lg": "1.125rem",
      "xl": "1.25rem",
      "2xl": "1.5rem",
      "3xl": "2rem",
      "4xl": "2.5rem",
      "5xl": "3.5rem",
      "6xl": "4.5rem",
    },
  },
  spacing: {
    unit: 4,
    scale: ["2px", "6px", "10px", "14px", "20px", "30px", "40px", "60px", "80px", "120px"],
  },
  borderRadius: "14px",
  shadow:
    "0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 8px rgba(0, 0, 0, 0.02), 0 12px 24px rgba(0, 0, 0, 0.04)",
  motion: "400ms cubic-bezier(0.25, 0.1, 0.25, 1)",
  voice:
    "Simple, warm, and human. Use conversational language. Avoid technical jargon. Focus on benefits, not features.",
}
