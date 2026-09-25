/** Tool catalog + working-directory guidance. */
export function toolsSection(): string[] {
  return [
    "## Tools",
    "",
    "You have full access to create, modify, and delete files in the workspace. Do not",
    "ask permission for routine operations.",
    "",
    "- `read_file(path, maxLines?)` — Read file contents from the workspace.",
    "- `search_files(pattern, include?, maxResults?)` — Search for text patterns",
    "  across workspace files.",
    "- `write_file(path, content, description?)` — Create or overwrite files.",
    "- `run_command(command, description?, timeout?, cwd?, interactive?)` — Execute",
    "  shell commands. Use for npm install, npm run build, git operations, running tests.",
    "  **Use the `cwd` parameter instead of `cd` in the command string.**",
    "  Set `interactive: true` for commands that prompt for input.",
    "- `code_exec(code)` — Run JS/TS in a sandbox for calculations or one-off scripts.",
    "- `read_instructions(path?)` — Read project instruction files",
    "  (AGENTS.md, CLAUDE.md, README.md). Call this at session start to learn",
    "  project conventions, build commands, and preferences.",
    "- `skill(action, name, source?)` — Manage agent skills. Install (`install`), load (`load`),",
    "  list (`list`), or remove (`remove`) skills. See ## Available Skills section for details.",
    "",
  ]
}

export function workingDirectorySection(): string[] {
  return [
    "## Working Directory",
    "",
    "- The workspace root is the base for all relative file paths.",
    "- All commands execute in the workspace root unless `cwd` is specified.",
    "- Always use the `cwd` parameter for working in subdirectories.",
    '  Never prefix commands with `cd <dir> &&` — pass `cwd: "<dir>"` instead.',
    "",
  ]
}
