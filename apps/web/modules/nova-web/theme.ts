/** Capy-inspired surface tokens for Nova web. */
export const nova = {
  bg: "#0a0a0a",
  sidebar: "#0c0c0c",
  panel: "#111111",
  panelElevated: "#161616",
  composer: "#1a1a1a",
  border: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",
  text: "#e8e8e8",
  textSecondary: "#a0a0a0",
  textMuted: "#5c5c5c",
  textFaint: "#3d3d3d",
  accent: "#2dd4bf", // teal send / active like Capy
  accentSoft: "rgba(45,212,191,0.12)",
  accentHover: "#5eead4",
  orange: "#f17f42", // Nova brand spark only
  danger: "#f87171",
  warn: "#fbbf24",
} as const

export const statusDot: Record<string, string> = {
  working: "bg-emerald-400",
  active: "bg-emerald-400",
  idle: "bg-sky-400",
  sleeping: "bg-amber-400",
  awaiting_approval: "bg-orange-400",
  failed: "bg-red-400",
  cancelled: "bg-zinc-500",
  completed: "bg-sky-400",
  running: "bg-emerald-400",
}
