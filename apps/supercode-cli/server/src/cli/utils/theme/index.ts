/**
 * Phosphor CRT palette — single source for chalk TUI and OpenTUI.
 * OpenTUI imports the same hex values from `src/cli/tui/theme.ts`
 * (kept in sync intentionally; both are thin constants).
 */
export const theme = {
  // Phosphor greens (primary palette)
  green: "#00ff88",
  greenDim: "#1a4a36",
  greenDeep: "#0a2a1c",
  greenGlow: "#7fffb4",
  greenMute: "#3a6e54",

  // Warm accents (used sparingly)
  amber: "#ffb84d",
  amberDim: "#7a5520",
  red: "#ff4458",
  redMute: "#7a2a35",
  redDim: "#5a1a25",

  // Greys
  white: "#e6edf3",
  muted: "#7a8a82",
  dim: "#3a4a42",

  // Pure
  black: "#000000",
} as const

export type Theme = typeof theme
