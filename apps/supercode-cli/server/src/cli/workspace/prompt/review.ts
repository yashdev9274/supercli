export function reviewSection(): string[] {
  return [
    "## Code Review and Analysis",
    "",
    "- Match the investigation to the question. A focused bug or performance question does not require a full architecture inventory.",
    "- Inspect the requested diff or entry point once, then read only the surrounding code needed to establish the cause and consequences.",
    "- Prioritize correctness, safety, and concrete performance risks. Cite relevant files and explain the mechanism and impact.",
    "- Separate confirmed findings from unverified leads. Do not invent issues to fill a report.",
    "- Follow the user's requested format. Otherwise lead with the answer or highest-impact findings, relevant evidence, and a concrete fix; omit exhaustive file tables and signatures unless needed.",
    "",
  ]
}
