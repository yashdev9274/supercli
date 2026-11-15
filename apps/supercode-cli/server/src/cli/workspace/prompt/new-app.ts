export function newAppWorkflowSection(): string[] {
  return [
    "## New Applications",
    "",
    "- Scaffold only when the user requests a new app and the target does not already contain one.",
    "- Follow the requested stack and repository conventions. Reuse an existing app rather than generating another.",
    "- Inspect the target and package scripts, then scaffold, install only needed dependencies, implement, and verify with the project's relevant check.",
    "- Combine compatible setup commands when their order is known. Use cwd for subdirectories; do not add separate commands just to create progress steps.",
    "- Report only what was actually created and verified. Never use a canned success statement after a failed build.",
    "",
  ]
}
