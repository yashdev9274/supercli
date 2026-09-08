import Foundation

/// OpenAI / OpenRouter function-tool definitions mirrored from supercode-cli tools.
enum ToolCatalog {
    static let maxAgentSteps = 24

    static func tools(for mode: AgentMode) -> [[String: Any]] {
        let names = toolNames(for: mode)
        return names.compactMap { name in
            if let definition = TerminalContract.tools[name] {
                return ["type": "function", "function": definition]
            }
            return definitions[name]
        }
    }

    static func toolNames(for mode: AgentMode) -> [String] {
        let readOnly = ["read_file", "search_files", "url_fetch", "exa_search", "firecrawl_search", "question", "todowrite", "delegate", "task"]
        switch mode {
        case .chat: return readOnly
        case .plan: return readOnly + ["switch_to_agent_mode"]
        case .tools, .agent: return readOnly + ["write_file", "edit_file", "run_command"]
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
            lines.append("When the user @mentions a filename (e.g. @offline-ai.md), resolve it under the workspace (search if needed) and read it with read_file before answering.")
            if let gitBranch {
                lines.append("Current git branch: \(gitBranch)")
            }
        } else {
            lines.append("No workspace is connected. Ask the user to open a workspace before file or shell tools.")
        }

        // Shared anti-monologue rules (models often leak internal planning as the only "answer").
        lines.append("""
        OUTPUT RULES (critical):
        - Never narrate your plan in the user-visible answer. Do NOT write lines like "The user wants me to…", "Let me find and read…", "I'll start by…", or "I need to…".
        - If you need information from the workspace, your FIRST action must be a tool call (read_file / search_files / run_command). Do not describe the tool call in prose first.
        - Internal monologue belongs in reasoning only if the model supports it — never as the final assistant message.
        - After tools return, answer the user directly with guidance, findings, and concrete paths. No preamble about what you were asked.
        - Prefer short, structured guidance over dumping the whole file unless the user asked for the full contents.
        """)

        switch mode {
        case .chat:
            lines.append("""
            Mode: chat.
            You may use read-only tools (read_file, search_files, web/url fetch).
            Do NOT write files, edit files, or run mutating shell commands.
            For "review this file / guide me" requests: call read_file (or search_files to locate it), then give a clear guide.
            Answer questions and explain code clearly.
            """)
        case .tools:
            lines.append("""
            Mode: tools.
            You may read, write, edit, and run commands when needed.
            Always read before editing. Prefer edit_file for targeted changes and write_file for new/full rewrites.
            After mutations, briefly summarize what changed.
            Start with tools, not narration.
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
            1. Call tools immediately (explore with read/search as needed).
            2. Make targeted edits with edit_file / write_file.
            3. Run commands to verify (tests, builds) when useful.
            4. Summarize results with paths and outcomes — only after tools ran.
            Never claim you changed a file without calling a write/edit tool.
            Use real newlines in file contents — not the two-character sequence \\n.
            Do not use `cd` inside run_command; pass relative `cwd` instead.
            FIRST RESPONSE RULE: if the task needs files or shell, begin with a tool call. Do not open with a planning paragraph.
            """)
        }

        lines.append("""
        Tool result format: tools return JSON strings. Treat cancelled/permission-denied results as failures and adjust.
        When done, give a short final answer without dumping large file contents unless requested.
        """)
        return lines.joined(separator: "\n")
    }

    // MARK: - Definitions

    private static let definitions: [String: [String: Any]] = [
        "switch_to_agent_mode": fn("switch_to_agent_mode", "Ask the user to select Agent mode; does not change permissions.", props: ["reason": prop("string", "Why implementation needs Agent mode")], required: ["reason"]),
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
