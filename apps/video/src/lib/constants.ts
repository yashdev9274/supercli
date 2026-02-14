// Improved timing constants for better flow (30s total)
export const COLORS = {
  background: '#0a0a0a', // Deep black
  backgroundLight: '#161616',
  primary: '#f97316', // Orange accent
  primaryGlow: 'rgba(249, 115, 22, 0.5)',
  text: '#ffffff',
  textMuted: '#a1a1aa',
  textDim: '#52525b',
  border: '#27272a',
} as const;

export const FONTS = {
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  serif: 'Georgia, "Times New Roman", serif',
} as const;

// Timing for 30 second video
export const DURATIONS = {
  hook: 90,        // 3s - hook
  problem: 120,    // 4s - problem
  solution: 150,   // 5s - solution
  terminal: 210,   // 7s - terminal demo
  cta: 120,        // 4s - CTA with coming soon
  total: 690,      // 23s total
} as const;