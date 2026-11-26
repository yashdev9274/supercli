/** Two sentences at most, so the dynamic island can speak a Nova answer. */
export function spokenSummary(answer: string): string {
  const clean = answer
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}[^\n]*\n+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+([.!?])/g, "$1")
  if (!clean) return "Done. I left the full result in your Nova thread."
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean]
  const summary = sentences.slice(0, 2).join(" ").replace(/\s+/g, " ").trim()
  return summary.length > 320 ? `${summary.slice(0, 317).trimEnd()}...` : summary
}
