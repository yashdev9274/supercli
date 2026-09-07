import Foundation

struct ToolExecutionResult: Equatable {
    var json: String
    var success: Bool
    var cancelled: Bool
    /// Absolute path of a file mutation, if any.
    var mutatedAbsolutePath: String?
    var mutatedRelativePath: String?
    var previousContent: String?
    var newContent: String?
    var preview: String?
}

enum LocalToolRuntime {
    private static let maxFileBytes = 1_000_000
    private static let ignoredDirNames: Set<String> = [
        ".git", "node_modules", ".next", "dist", "build", ".turbo",
        "DerivedData", ".cache", "xcuserdata",
    ]

/// Map common aliases / provider-mangled names onto catalog tools.
    /// Server used to teach models tools named "0"/"1" when desktop sent an
    /// OpenAI tool array — keep a soft fallback for any leftover history.
    private static func canonicalizeName(_ raw: String) -> String {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        switch name {
        case "read", "Read", "read_file_tool", "filesystem_read":
            return "read_file"
        case "search", "grep", "Glob", "glob", "list_dir", "explore":
            return "search_files"
        case "write", "Write", "create_file":
            return "write_file"
        case "edit", "Edit", "str_replace", "apply_patch":
            return "edit_file"
        case "bash", "shell", "Shell", "run", "terminal":
            return "run_command"
        case "fetch", "http_get", "browse":
            return "url_fetch"
        case "search_web", "websearch":
            return "web_search"
        case "todo", "todo_write", "update_todo":
            return "todowrite"
        default:
            return name
        }
    }

    /// Coerce alternate arg keys models sometimes emit (file_path vs path).
    private static func normalizeArgs(_ name: String, _ args: [String: Any]) -> [String: Any] {
        var out = args
        func adopt(_ canonical: String, aliases: [String]) {
            if out[canonical] != nil { return }
            for a in aliases {
                if let v = out[a] {
                    out[canonical] = v
                    return
                }
            }
        }
        switch name {
        case "read_file", "write_file", "edit_file":
            adopt("path", aliases: ["file_path", "filePath", "filepath", "file", "target"])
            adopt("content", aliases: ["text", "body", "data"])
            adopt("oldText", aliases: ["old_string", "old_str", "search"])
            adopt("newText", aliases: ["new_string", "new_str", "replace"])
        case "search_files":
            adopt("pattern", aliases: ["query", "q", "regex", "search"])
        case "run_command":
            adopt("command", aliases: ["cmd", "shell", "code"])
        case "url_fetch":
            adopt("url", aliases: ["uri", "href", "link"])
        case "web_search":
            adopt("query", aliases: ["q", "search", "prompt"])
        default:
            break
        }
        return out
    }

    @MainActor
    static func execute(
        name: String,
        args: [String: Any],
        workspaceRoot: String?,
        mode: AgentMode
    ) async -> ToolExecutionResult {
        let name = canonicalizeName(name)
        let args = normalizeArgs(name, args)

        // Mode hard-blocks
        if (mode == .plan || mode == .chat) && ToolCatalog.requiresPermission(name) {
            return failJSON(cancelled: true, reason: "Tool '\(name)' is not allowed in \(mode.rawValue) mode")
        }

        let allowed = await PermissionManager.shared.authorize(
            toolName: name,
            args: args,
            mode: mode
        )
        if !allowed {
            return failJSON(cancelled: true, reason: "Permission denied by user")
        }

        do {
            switch name {
            case "read_file":
                return try readFile(args: args, root: workspaceRoot)
            case "search_files":
                return try searchFiles(args: args, root: workspaceRoot)
            case "write_file":
                return try writeFile(args: args, root: workspaceRoot)
            case "edit_file":
                return try editFile(args: args, root: workspaceRoot)
            case "run_command":
                return try await runCommand(args: args, root: workspaceRoot)
            case "code_exec":
                return try await codeExec(args: args, root: workspaceRoot)
            case "url_fetch":
                return try await urlFetch(args: args)
            case "web_search":
                return try await webSearch(args: args)
            case "read_instructions":
                return try readInstructions(args: args, root: workspaceRoot)
            case "question":
                return question(args: args)
            case "todowrite":
                return todowrite(args: args)
            case "switch_to_agent_mode":
                return switchToAgent(args: args)
            default:
                return failJSON(cancelled: false, reason: "Unknown tool: \(name)")
            }
        } catch {
            return failJSON(cancelled: false, reason: error.localizedDescription)
        }
    }

    // MARK: - File tools

    private static func requireRoot(_ root: String?) throws -> String {
        guard let root, !root.isEmpty else {
            throw ToolError("No workspace open. Ask the user to open a workspace first.")
        }
        return root
    }

    private static func resolvePath(_ relative: String, root: String) throws -> (abs: String, rel: String) {
        let expanded = (relative as NSString).expandingTildeInPath
        let abs: String
        if expanded.hasPrefix("/") {
            abs = URL(fileURLWithPath: expanded).standardizedFileURL.path
        } else {
            abs = URL(fileURLWithPath: root)
                .appendingPathComponent(expanded)
                .standardizedFileURL.path
        }
        let rootStd = URL(fileURLWithPath: root).standardizedFileURL.path
        guard abs == rootStd || abs.hasPrefix(rootStd + "/") else {
            throw ToolError("Path \"\(relative)\" is outside workspace root")
        }
        let rel = abs == rootStd ? "." : String(abs.dropFirst(rootStd.count + 1))
        return (abs, rel)
    }

    private static func readFile(args: [String: Any], root: String?) throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let path = args["path"] as? String else {
            return failJSON(cancelled: false, reason: "path is required")
        }
        let resolved = try resolvePath(path, root: root)
        let data = try Data(contentsOf: URL(fileURLWithPath: resolved.abs))
        if data.contains(0) {
            return failJSON(cancelled: false, reason: "Binary file")
        }
        var content = String(data: data, encoding: .utf8) ?? ""
        let totalLines = content.split(separator: "\n", omittingEmptySubsequences: false).count
        if let maxLines = intValue(args["maxLines"]), maxLines > 0 {
            let lines = content.split(separator: "\n", omittingEmptySubsequences: false)
            if lines.count > maxLines {
                content = lines.prefix(maxLines).joined(separator: "\n")
                    + "\n\n... (\(lines.count - maxLines) more lines)"
            }
        }
        // Cap payload size for model context
        if content.count > 120_000 {
            content = String(content.prefix(120_000)) + "\n\n... (truncated)"
        }
        return okJSON([
            "path": resolved.rel,
            "content": content,
            "totalLines": totalLines,
        ], preview: "read \(resolved.rel)")
    }

    private static func writeFile(args: [String: Any], root: String?) throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let path = args["path"] as? String else {
            return failJSON(cancelled: false, reason: "path is required")
        }
        guard let content = args["content"] as? String else {
            return failJSON(cancelled: false, reason: "content is required")
        }
        if content.contains("\0") {
            return failJSON(cancelled: false, reason: "Binary content rejected")
        }
        if content.utf8.count > maxFileBytes {
            return failJSON(cancelled: false, reason: "File exceeds 1MB limit")
        }
        let resolved = try resolvePath(path, root: root)
        let url = URL(fileURLWithPath: resolved.abs)
        var previous: String?
        if FileManager.default.fileExists(atPath: resolved.abs) {
            previous = try? String(contentsOf: url, encoding: .utf8)
        }
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try content.write(to: url, atomically: true, encoding: .utf8)
        return ToolExecutionResult(
            json: okString([
                "path": resolved.rel,
                "size": content.utf8.count,
                "action": previous == nil ? "created" : "overwritten",
            ]),
            success: true,
            cancelled: false,
            mutatedAbsolutePath: resolved.abs,
            mutatedRelativePath: resolved.rel,
            previousContent: previous,
            newContent: content,
            preview: "wrote \(resolved.rel)"
        )
    }

    private static func editFile(args: [String: Any], root: String?) throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let path = args["path"] as? String,
              let oldText = args["oldText"] as? String,
              let newText = args["newText"] as? String
        else {
            return failJSON(cancelled: false, reason: "path, oldText, and newText are required")
        }
        let replaceAll = boolValue(args["replaceAll"]) ?? false
        let resolved = try resolvePath(path, root: root)
        let url = URL(fileURLWithPath: resolved.abs)
        guard FileManager.default.fileExists(atPath: resolved.abs) else {
            return failJSON(cancelled: false, reason: "File \"\(path)\" does not exist. Use write_file to create new files.")
        }
        let original = try String(contentsOf: url, encoding: .utf8)
        let occurrences = original.components(separatedBy: oldText).count - 1
        if occurrences == 0 {
            return failJSON(
                cancelled: false,
                reason: "oldText not found in \"\(path)\". Re-read the file and copy exact text."
            )
        }
        if !replaceAll && occurrences > 1 {
            return failJSON(
                cancelled: false,
                reason: "oldText appears \(occurrences) times. Use replaceAll: true or refine oldText."
            )
        }
        let updated = original.replacingOccurrences(
            of: oldText,
            with: newText,
            options: [],
            range: nil
        )
        // For non-replaceAll, only first — String.replacingOccurrences replaces all by default.
        let finalContent: String
        if replaceAll {
            finalContent = updated
        } else if let range = original.range(of: oldText) {
            finalContent = original.replacingCharacters(in: range, with: newText)
        } else {
            finalContent = original
        }
        try finalContent.write(to: url, atomically: true, encoding: .utf8)
        return ToolExecutionResult(
            json: okString([
                "path": resolved.rel,
                "replacements": replaceAll ? occurrences : 1,
                "sizeBefore": original.utf8.count,
                "sizeAfter": finalContent.utf8.count,
                "action": "edited",
            ]),
            success: true,
            cancelled: false,
            mutatedAbsolutePath: resolved.abs,
            mutatedRelativePath: resolved.rel,
            previousContent: original,
            newContent: finalContent,
            preview: "edited \(resolved.rel)"
        )
    }

    private static func searchFiles(args: [String: Any], root: String?) throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let pattern = args["pattern"] as? String, !pattern.isEmpty else {
            return failJSON(cancelled: false, reason: "pattern is required")
        }
        let include = args["include"] as? String
        let maxResults = intValue(args["maxResults"]) ?? 20

        // Prefer ripgrep if available, else grep.
        let rg = "/opt/homebrew/bin/rg"
        let rgAlt = "/usr/local/bin/rg"
        let useRg = FileManager.default.isExecutableFile(atPath: rg)
            || FileManager.default.isExecutableFile(atPath: rgAlt)
        let rgPath = FileManager.default.isExecutableFile(atPath: rg) ? rg : rgAlt

        let process = Process()
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        process.currentDirectoryURL = URL(fileURLWithPath: root)

        if useRg {
            process.executableURL = URL(fileURLWithPath: rgPath)
            var arguments = ["-n", "--no-heading", "--color", "never", "-m", "\(maxResults)", pattern]
            if let include, !include.isEmpty {
                arguments.append(contentsOf: ["-g", include])
            }
            arguments.append(".")
            process.arguments = arguments
        } else {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/grep")
            var arguments = ["-rn", "--binary-files=without-match"]
            if let include, !include.isEmpty {
                arguments.append("--include=\(include)")
            }
            arguments.append(contentsOf: ["-m", "1", "-e", pattern, root])
            process.arguments = arguments
        }

        try process.run()
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""
        var matches = output
            .split(separator: "\n")
            .map(String.init)
            .filter { !$0.isEmpty }
        if matches.count > maxResults {
            matches = Array(matches.prefix(maxResults))
        }
        // Relativize absolute paths
        let rootPrefix = root.hasSuffix("/") ? root : root + "/"
        matches = matches.map { line in
            if line.hasPrefix(rootPrefix) {
                return String(line.dropFirst(rootPrefix.count))
            }
            return line
        }
        return okJSON([
            "matches": matches,
            "total": matches.count,
            "pattern": pattern,
        ], preview: "\(matches.count) matches")
    }

    private static func readInstructions(args: [String: Any], root: String?) throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        if let path = args["path"] as? String, !path.isEmpty {
            return try readFile(args: ["path": path, "maxLines": 400], root: root)
        }
        let candidates = [
            "AGENTS.md", "CLAUDE.md", "WARP.md", "README.md",
            ".cursorrules", "CONTRIBUTING.md", "docs/AGENTS.md",
        ]
        var found: [[String: Any]] = []
        for name in candidates {
            let full = URL(fileURLWithPath: root).appendingPathComponent(name).path
            if FileManager.default.fileExists(atPath: full),
               let text = try? String(contentsOfFile: full, encoding: .utf8) {
                let clipped = text.count > 40_000 ? String(text.prefix(40_000)) + "\n..." : text
                found.append(["path": name, "content": clipped])
            }
        }
        return okJSON(["files": found, "count": found.count], preview: "\(found.count) instruction files")
    }

    // MARK: - Shell

    private static func runCommand(args: [String: Any], root: String?) async throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let command = args["command"] as? String, !command.isEmpty else {
            return failJSON(cancelled: false, reason: "command is required")
        }
        let timeoutMs = intValue(args["timeout"]) ?? 300_000
        var cwd = root
        if let sub = args["cwd"] as? String, !sub.isEmpty {
            cwd = try resolvePath(sub, root: root).abs
        }
        return try await shell(command: command, cwd: cwd, timeoutMs: timeoutMs)
    }

    private static func codeExec(args: [String: Any], root: String?) async throws -> ToolExecutionResult {
        let root = try requireRoot(root)
        guard let code = args["code"] as? String, !code.isEmpty else {
            return failJSON(cancelled: false, reason: "code is required")
        }
        return try await shell(command: code, cwd: root, timeoutMs: 60_000)
    }

    private static func shell(command: String, cwd: String, timeoutMs: Int) async throws -> ToolExecutionResult {
        try await withCheckedThrowingContinuation { cont in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/bin/sh")
                process.arguments = ["-c", command]
                process.currentDirectoryURL = URL(fileURLWithPath: cwd)
                process.environment = [
                    "PATH": ProcessInfo.processInfo.environment["PATH"] ?? "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
                    "HOME": NSHomeDirectory(),
                    "CI": "true",
                    "npm_config_yes": "true",
                    "NONINTERACTIVE": "1",
                    "TERM": "dumb",
                    "PAGER": "cat",
                    "GIT_TERMINAL_PROMPT": "0",
                    "SUPERCODE_WORKSPACE_ROOT": cwd,
                ]
                let out = Pipe()
                let err = Pipe()
                process.standardOutput = out
                process.standardError = err
                process.standardInput = Pipe()

                do {
                    try process.run()
                } catch {
                    cont.resume(returning: failJSON(cancelled: true, reason: "Failed to start: \(error.localizedDescription)"))
                    return
                }

                let timeout = DispatchTime.now() + .milliseconds(timeoutMs)
                var killed = false
                let group = DispatchGroup()
                group.enter()
                DispatchQueue.global().async {
                    process.waitUntilExit()
                    group.leave()
                }
                let waitResult = group.wait(timeout: timeout)
                if waitResult == .timedOut {
                    killed = true
                    process.terminate()
                    process.waitUntilExit()
                }

                let stdout = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
                let code = Int(process.terminationStatus)
                let clippedOut = String(stdout.prefix(80_000))
                let clippedErr = String(stderr.prefix(40_000))
                let payload: [String: Any] = [
                    "exitCode": code,
                    "stdout": clippedOut,
                    "stderr": clippedErr,
                    "success": code == 0 && !killed,
                    "cancelled": killed,
                    "summary": killed
                        ? "Command timed out after \(timeoutMs / 1000)s"
                        : (code == 0 ? "Command completed successfully" : "Command failed with exit code \(code)"),
                ]
                cont.resume(returning: ToolExecutionResult(
                    json: okString(payload),
                    success: code == 0 && !killed,
                    cancelled: killed,
                    mutatedAbsolutePath: nil,
                    mutatedRelativePath: nil,
                    previousContent: nil,
                    newContent: nil,
                    preview: String(command.prefix(80))
                ))
            }
        }
    }

    // MARK: - Web

    private static func urlFetch(args: [String: Any]) async throws -> ToolExecutionResult {
        guard let urlString = args["url"] as? String,
              let url = URL(string: urlString),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else {
            return failJSON(cancelled: false, reason: "Valid http(s) url is required")
        }
        let maxChars = intValue(args["maxChars"]) ?? 20_000
        var req = URLRequest(url: url)
        req.setValue("Supercode Desktop", forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        var text = String(data: data, encoding: .utf8)
            ?? String(data: data, encoding: .isoLatin1)
            ?? ""
        // Strip simple tags for HTML
        if text.contains("<html") || text.contains("<HTML") {
            text = text.replacingOccurrences(of: #"<script[\s\S]*?</script>"#, with: " ", options: .regularExpression)
            text = text.replacingOccurrences(of: #"<style[\s\S]*?</style>"#, with: " ", options: .regularExpression)
            text = text.replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
            text = text.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        }
        if text.count > maxChars {
            text = String(text.prefix(maxChars)) + "\n... (truncated)"
        }
        return okJSON([
            "url": urlString,
            "status": status,
            "content": text,
        ], preview: "fetch \(url.host ?? urlString)")
    }

    private static func webSearch(args: [String: Any]) async throws -> ToolExecutionResult {
        guard let query = args["query"] as? String, !query.isEmpty else {
            return failJSON(cancelled: false, reason: "query is required")
        }
        let maxResults = intValue(args["maxResults"]) ?? 5
        // DuckDuckGo instant answer API (no key). Best-effort.
        var components = URLComponents(string: "https://api.duckduckgo.com/")!
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "no_redirect", value: "1"),
            URLQueryItem(name: "no_html", value: "1"),
        ]
        guard let url = components.url else {
            return failJSON(cancelled: false, reason: "Bad search URL")
        }
        let (data, _) = try await URLSession.shared.data(from: url)
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        var results: [[String: String]] = []
        if let abs = obj["AbstractText"] as? String, !abs.isEmpty {
            results.append([
                "title": (obj["Heading"] as? String) ?? query,
                "url": (obj["AbstractURL"] as? String) ?? "",
                "snippet": abs,
            ])
        }
        if let related = obj["RelatedTopics"] as? [[String: Any]] {
            for item in related {
                if results.count >= maxResults { break }
                if let text = item["Text"] as? String, let u = item["FirstURL"] as? String {
                    results.append(["title": String(text.prefix(80)), "url": u, "snippet": text])
                } else if let topics = item["Topics"] as? [[String: Any]] {
                    for t in topics {
                        if results.count >= maxResults { break }
                        if let text = t["Text"] as? String, let u = t["FirstURL"] as? String {
                            results.append(["title": String(text.prefix(80)), "url": u, "snippet": text])
                        }
                    }
                }
            }
        }
        if results.isEmpty {
            results.append([
                "title": "Search",
                "url": "https://duckduckgo.com/?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)",
                "snippet": "No structured results. Open the search URL in a browser.",
            ])
        }
        return okJSON(["query": query, "results": results], preview: "search \(query)")
    }

    // MARK: - Meta tools

    private static func question(args: [String: Any]) -> ToolExecutionResult {
        let prompt = args["prompt"] as? String ?? "Clarification needed"
        let options = args["options"] as? [Any] ?? []
        // Surface via special JSON the UI can display; agent should wait for next user turn.
        return okJSON([
            "type": "question",
            "prompt": prompt,
            "options": options,
            "note": "Present this question to the user and wait for their reply in the next message.",
        ], preview: prompt)
    }

    private static func todowrite(args: [String: Any]) -> ToolExecutionResult {
        let todos = args["todos"] as? [Any] ?? []
        return okJSON([
            "ok": true,
            "todos": todos,
            "count": todos.count,
        ], preview: "\(todos.count) todos")
    }

    private static func switchToAgent(args: [String: Any]) -> ToolExecutionResult {
        let reason = args["reason"] as? String ?? "Implementation requested"
        return okJSON([
            "ok": true,
            "action": "switch_to_agent_mode",
            "reason": reason,
            "note": "UI should switch mode to agent when the user confirms.",
        ], preview: reason)
    }

    // MARK: - JSON helpers

    private static func okJSON(_ value: [String: Any], preview: String?) -> ToolExecutionResult {
        ToolExecutionResult(
            json: okString(value),
            success: true,
            cancelled: false,
            mutatedAbsolutePath: nil,
            mutatedRelativePath: nil,
            previousContent: nil,
            newContent: nil,
            preview: preview
        )
    }

    private static func failJSON(cancelled: Bool, reason: String) -> ToolExecutionResult {
        let payload: [String: Any] = [
            "success": false,
            "cancelled": cancelled,
            "reason": reason,
        ]
        return ToolExecutionResult(
            json: stringify(payload),
            success: false,
            cancelled: cancelled,
            mutatedAbsolutePath: nil,
            mutatedRelativePath: nil,
            previousContent: nil,
            newContent: nil,
            preview: reason
        )
    }

    private static func okString(_ value: [String: Any]) -> String {
        var merged = value
        if merged["success"] == nil {
            merged["success"] = true
        }
        return stringify(merged)
    }

    private static func stringify(_ value: Any) -> String {
        guard JSONSerialization.isValidJSONObject(value),
              let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
              let s = String(data: data, encoding: .utf8)
        else {
            return "{\"success\":false,\"reason\":\"Failed to encode tool result\"}"
        }
        return s
    }

    private static func intValue(_ any: Any?) -> Int? {
        if let i = any as? Int { return i }
        if let d = any as? Double { return Int(d) }
        if let n = any as? NSNumber { return n.intValue }
        if let s = any as? String { return Int(s) }
        return nil
    }

    private static func boolValue(_ any: Any?) -> Bool? {
        if let b = any as? Bool { return b }
        if let n = any as? NSNumber { return n.boolValue }
        if let s = any as? String {
            return ["true", "1", "yes"].contains(s.lowercased())
        }
        return nil
    }
}

private struct ToolError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
