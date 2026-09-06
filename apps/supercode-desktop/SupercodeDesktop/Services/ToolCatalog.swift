import Foundation

/// OpenAI / OpenRouter function-tool definitions mirrored from supercode-cli tools.
enum ToolCatalog {
    static let maxAgentSteps = 24

    static func tools(for mode: AgentMode) -> [[String: Any]] {
        let names = toolNames(for: mode)
        return names.compactMap { definitions[$0] }
    }

    static func toolNames(for mode: AgentMode) -> [String] {
        switch mode {
        case .chat:
            return [
                "read_file", "search_files", "url_fetch", "web_search",
                "read_instructions", "question",
            ]
        case .tools:
            return [
                "read_file", "search_files", "write_file", "edit_file",
                "run_command", "url_fetch", "web_search", "read_instructions",
                "question", "todowrite",
            ]
        case .plan:
            return [
                "read_file", "search_files", "url_fetch", "web_search",
                "read_instructions", "question", "todowrite", "switch_to_agent_mode",
            ]
        case .agent:
            return [
                "read_file", "search_files", "write_file", "edit_file",
                "run_command", "url_fetch", "web_search", "code_exec",
                "read_instructions", "question", "todowrite", "switch_to_agent_mode",
            ]
        }
    }

    static func requiresPermission(_ name: String) -> Bool {
        switch name {
        case "write_file", "edit_file", "run_command", "code_exec":
            return true
        default:
            return false
        }
    }

    static func isDestructive(_ name: String, args: [String: Any]) -> Bool {
        if name == "write_file" || name == "edit_file" || name == "code_exec" {
            return true
        }
        if name == "run_command", let cmd = args["command"] as? String {
            let lower = cmd.lowercased()
            let dangerous = ["rm -rf", "rm -r", "sudo ", "git push --force", "git push -f",
                             "drop table", "mkfs", "shutdown", "reboot", "chmod -r 777"]
            return dangerous.contains { lower.contains($0) }
        }
        return false
    }

    static func systemPrompt(
        mode: AgentMode,
        workspacePath: String?,
        gitBranch: String?,
        effort: EffortLevel
    ) -> String {
        var lines: [String] = []
        lines.append("You are Supercode, a coding agent running inside the Supercode Desktop macOS app.")
        lines.append("Be concise, accurate, and action-oriented. Prefer tools over speculation.")
        lines.append("Effort level: \(effort.rawValue). Match depth of analysis and tool use to this setting.")

        if let workspacePath {
            lines.append("Workspace root: \(workspacePath)")
            lines.append("All file paths for tools are relative to this workspace root unless absolute under it.")
            if let gitBranch {
                lines.append("Current git branch: \(gitBranch)")
            }
        } else {
            lines.append("No workspace is connected. Ask the user to open a workspace before file or shell tools.")
        }

        switch mode {
        case .chat:
            lines.append("""
            Mode: chat.
            You may use read-only tools (read_file, search_files, web/url fetch).
            Do NOT write files, edit files, or run mutating shell commands.
            Answer questions and explain code clearly.
            """)
        case .tools:
            lines.append("""
            Mode: tools.
            You may read, write, edit, and run commands when needed.
            Always read before editing. Prefer edit_file for targeted changes and write_file for new/full rewrites.
            After mutations, briefly summarize what changed.
            """)
        case .plan:
            lines.append("""
            Mode: plan (read-only analysis).
            Explore the codebase, reason about approaches, and produce a clear implementation plan.
            You cannot modify files or run mutating commands.
            Structure plans with goals, steps, risks, and files to touch.
            If the user asks you to implement, call switch_to_agent_mode and explain they should switch to Agent mode.
            """)
        case .agent:
            lines.append("""
            Mode: agent (build).
            You have full coding tools. Execute multi-step tasks end-to-end.
            Workflow:
            1. Explore with read/search as needed.
            2. Make targeted edits with edit_file / write_file.
            3. Run commands to verify (tests, builds) when useful.
            4. Summarize results with paths and outcomes.
            Never claim you changed a file without calling a write/edit tool.
            Use real newlines in file contents — not the two-character sequence \\n.
            Do not use `cd` inside run_command; pass relative `cwd` instead.
            """)
        }

        lines.append("""
        Tool result format: tools return JSON strings. Treat cancelled/permission-denied results as failures and adjust.
        When done, give a short final answer without dumping large file contents.
        """)
        return lines.joined(separator: "\n")
    }

    // MARK: - Definitions

    private static let definitions: [String: [String: Any]] = [
        "read_file": fn(
            "read_file",
            "Read the contents of a file within the workspace.",
            props: [
                "path": prop("string", "Relative path from workspace root"),
                "maxLines": prop("number", "Maximum number of lines to read (omit for full file)"),
                "description": prop("string", "What to look for (for display)"),
            ],
            required: ["path"]
        ),
        "search_files": fn(
            "search_files",
            "Search for text patterns across workspace files.",
            props: [
                "pattern": prop("string", "Text or regex pattern to search for"),
                "include": prop("string", "File glob pattern e.g. '*.ts'"),
                "maxResults": prop("number", "Maximum number of results (default 20)"),
            ],
            required: ["pattern"]
        ),
        "write_file": fn(
            "write_file",
            "Create a new file or overwrite an existing file with complete content.",
            props: [
                "path": prop("string", "Relative path from workspace root"),
                "content": prop("string", "Complete file content to write (real newlines)"),
                "description": prop("string", "Brief description of what this file does"),
            ],
            required: ["path", "content"]
        ),
        "edit_file": fn(
            "edit_file",
            "Replace an exact substring in an existing file. Read first; oldText must match exactly.",
            props: [
                "path": prop("string", "Relative path from workspace root"),
                "oldText": prop("string", "Exact substring to find including whitespace"),
                "newText": prop("string", "Replacement text"),
                "replaceAll": prop("boolean", "Replace all occurrences (default false)"),
                "description": prop("string", "Brief description of the edit"),
            ],
            required: ["path", "oldText", "newText"]
        ),
        "run_command": fn(
            "run_command",
            "Execute a shell command in the workspace. Do not use cd; use cwd instead.",
            props: [
                "command": prop("string", "Shell command to execute"),
                "description": prop("string", "Purpose of this command"),
                "timeout": prop("number", "Timeout in milliseconds (default 300000)"),
                "cwd": prop("string", "Working directory relative to workspace root"),
            ],
            required: ["command"]
        ),
        "code_exec": fn(
            "code_exec",
            "Execute a short script via /bin/sh -c for quick checks.",
            props: [
                "code": prop("string", "Shell/script body to execute"),
                "description": prop("string", "What this script does"),
            ],
            required: ["code"]
        ),
        "url_fetch": fn(
            "url_fetch",
            "Fetch text content from a public HTTP(S) URL.",
            props: [
                "url": prop("string", "Absolute https URL"),
                "maxChars": prop("number", "Max characters to return (default 20000)"),
            ],
            required: ["url"]
        ),
        "web_search": fn(
            "web_search",
            "Search the web for documentation or current information. Returns titles and URLs.",
            props: [
                "query": prop("string", "Search query"),
                "maxResults": prop("number", "Max results (default 5)"),
            ],
            required: ["query"]
        ),
        "read_instructions": fn(
            "read_instructions",
            "Read project instruction files (AGENTS.md, CLAUDE.md, README.md, etc.) from the workspace.",
            props: [
                "path": prop("string", "Optional specific instruction file path"),
            ],
            required: []
        ),
        "question": fn(
            "question",
            "Ask the user a clarifying question when blocked. Prefer this over guessing.",
            props: [
                "prompt": prop("string", "Question to show the user"),
                "options": [
                    "type": "array",
                    "items": ["type": "string"],
                    "description": "Optional multiple-choice options",
                ] as [String: Any],
            ],
            required: ["prompt"]
        ),
        "todowrite": fn(
            "todowrite",
            "Update the agent's task checklist for multi-step work.",
            props: [
                "todos": [
                    "type": "array",
                    "description": "Todo items",
                    "items": [
                        "type": "object",
                        "properties": [
                            "id": prop("string", "Stable id"),
                            "title": prop("string", "Short title"),
                            "status": prop("string", "pending|in_progress|done"),
                        ] as [String: Any],
                        "required": ["title", "status"],
                    ] as [String: Any],
                ] as [String: Any],
            ],
            required: ["todos"]
        ),
        "switch_to_agent_mode": fn(
            "switch_to_agent_mode",
            "Request switching the conversation into agent (build) mode to implement changes.",
            props: [
                "reason": prop("string", "Why agent mode is needed"),
            ],
            required: ["reason"]
        ),
    ]

    private static func fn(
        _ name: String,
        _ description: String,
        props: [String: Any],
        required: [String]
    ) -> [String: Any] {
        var parameters: [String: Any] = [
            "type": "object",
            "properties": props,
            "additionalProperties": false,
        ]
        if !required.isEmpty {
            parameters["required"] = required
        }
        return [
            "type": "function",
            "function": [
                "name": name,
                "description": description,
                "parameters": parameters,
            ] as [String: Any],
        ]
    }

    private static func prop(_ type: String, _ description: String) -> [String: Any] {
        ["type": type, "description": description]
    }
}
