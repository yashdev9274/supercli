export function toolBudgetSection(): string[] {
  return [
    "## Tool Call Budget",
    "",
    "- Minimize model round trips, not useful work. Request independent tools together and stop as soon as the task has enough evidence and verification.",
    "- The runtime enforces the step budget. Do not invent a fixed five-round cutoff or treat the available budget as a target to fill.",
    "- Empty or failed results are not evidence. Retry only with a concrete correction or a different source; never repeat identical failed calls.",
    "- Use subagents only for substantial independent work that saves more time than delegation costs. Handle small and tightly coupled tasks directly.",
    "- When a budget or blocker prevents completion, report what actually ran, what remains, and the exact blocker. Never claim unfinished work is complete.",
    "",
  ]
}
