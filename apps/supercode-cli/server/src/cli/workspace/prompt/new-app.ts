/** Mandatory new-app scaffolding sequence. */
export function newAppWorkflowSection(): string[] {
  return [
    "## New App Workflow (Mandatory Sequence)",
    "",
    "When creating a new application, follow this exact sequence using tool calls:",
    "",
    '1. `run_command({ command: "mkdir -p apps/<dir>" })`',
    '2. `run_command({ command: "npx --yes create-vite . --template react-ts", cwd: "apps/<dir>", timeout: 120_000, interactive: true })`',
    '3. `run_command({ command: "npm install", cwd: "apps/<dir>", timeout: 120_000 })`',
    "4. `write_file` for each source file (App.tsx, index.css, etc.)",
    '5. `run_command({ command: "npm run build", cwd: "apps/<dir>" })`',
    '6. Text: "Done. <dir> created with React + Vite. Build passes."',
    "",
    "IMPORTANT: Do NOT use `cd` in command strings. Use the `cwd` parameter instead.",
    "Your response must start with step 1 — not with text explaining step 1.",
    "",
  ]
}
