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
/// Map common aliases / provider-mangled names onto catalog tools.
    /// Server used to teach models tools named "0"/"1" when desktop sent an
    /// OpenAI tool array — keep a soft fallback for any leftover history.
    static func canonicalizeName(_ raw: String) -> String {
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
        case "search_web", "websearch", "web_search":
            return "exa_search"
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
        case "exa_search", "firecrawl_search":
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
        do {
            try Task.checkCancellation()
            guard ToolCatalog.toolNames(for: mode).contains(name) else {
                return failJSON(cancelled: false, reason: "Tool '\(name)' is not allowed in \(mode.rawValue) mode", denied: true)
            }
            let normalized = normalizeArgs(name, args)
            let args = name == "switch_to_agent_mode" ? normalized : try TerminalContract.validate(name, args: normalized)
            let allowed = await PermissionManager.shared.authorize(toolName: name, args: args, mode: mode)
            try Task.checkCancellation()
            guard allowed else { return failJSON(cancelled: false, reason: "Permission denied by user", denied: true) }
            switch name {
            case "read_file", "write_file", "edit_file":
                return try await NativeFileTools.shared.execute(name, args: args, root: requireRoot(workspaceRoot))
            case "search_files":
                return try await searchFiles(args: args, root: requireRoot(workspaceRoot))
            case "run_command":
                guard args["interactive"] as? Bool != true, args["autoYes"] as? Bool != true else {
                    throw NativeToolError("Interactive and automatic yes are unsupported")
                }
                let root = try requireRoot(workspaceRoot)
                let cwd = try NativeFileTools.resolve(args["cwd"] as? String ?? ".", root: root).path
                let output = try await NativeCommandRunner.shared.run(arguments: ["-c", args["command"] as? String ?? ""], cwd: cwd, timeout: args["timeout"] as? Int ?? 300_000)
                var result = okJSON(output, preview: output["summary"] as? String)
                result.success = output["success"] as? Bool ?? false
                result.cancelled = output["cancelled"] as? Bool ?? false
                return result
            case "url_fetch": return try await urlFetch(args: args)
            case "exa_search", "firecrawl_search":
                return try await okJSON(NativeWebSearch.search(name: name, args: args), preview: args["query"] as? String)
            case "question": return question(args: args)
            case "todowrite": return todowrite(args: args)
            case "switch_to_agent_mode": return switchToAgent(args: args)
            default: throw NativeToolError("Unsupported tool: \(name)")
            }
        } catch {
            return failJSON(cancelled: Task.isCancelled || error is CancellationError, reason: error.localizedDescription)
        }
    }

    private static func requireRoot(_ root: String?) throws -> String {
        guard let root, !root.isEmpty else { throw NativeToolError("Open a workspace first") }
        return root
    }

    private static func searchFiles(args: [String: Any], root: String) async throws -> ToolExecutionResult {
        let rg = ["/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg"].first(where: { FileManager.default.isExecutableFile(atPath: $0) })
        let limit = args["maxResults"] as? Int ?? 20
        let listing = try await NativeDiscovery.shared.files(root: root, include: args["include"] as? String)
        let files = listing.paths
        if files.isEmpty { return okJSON(["matches": [], "total": 0, "truncated": listing.truncated], preview: "No matching files") }
        let arguments: [String]
        if rg != nil {
            var flags = ["--json", "--max-filesize", "1M", "--max-count", String(limit), "--color", "never"]
            if args["literal"] as? Bool == true { flags.append("--fixed-strings") }
            arguments = flags + ["--", args["pattern"] as? String ?? ""] + files
        } else {
            arguments = ["-n", "-H", "-I", args["literal"] as? Bool == true ? "-F" : "-E", "-m", String(limit), "-e", args["pattern"] as? String ?? "", "--"] + files
        }
        let output = try await NativeCommandRunner.shared.run(executable: rg ?? "/usr/bin/grep", arguments: arguments, cwd: root, timeout: 10_000)
        if output["cancelled"] as? Bool == true { throw CancellationError() }
        guard output["timedOut"] as? Bool != true, (output["exitCode"] as? Int ?? -1) <= 1, (output["exitCode"] as? Int ?? -1) >= 0 else {
            throw NativeToolError(output["stderr"] as? String ?? "Search failed")
        }
        var matches: [[String: Any]] = []
        for line in (output["stdout"] as? String ?? "").split(separator: "\n") {
            if rg == nil {
                let fields = line.split(separator: ":", maxSplits: 2, omittingEmptySubsequences: false)
                if matches.count < limit, fields.count == 3, let number = Int(fields[1]) {
                    matches.append(["file": String(fields[0]), "line": number, "content": String(fields[2].prefix(2000))])
                }
                continue
            }
            guard matches.count < limit,
                  let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], object["type"] as? String == "match",
                  let data = object["data"] as? [String: Any], let path = (data["path"] as? [String: Any])?["text"] as? String,
                  let content = (data["lines"] as? [String: Any])?["text"] as? String else { continue }
            _ = try NativeFileTools.resolve(path, root: root)
            matches.append(["file": path.hasPrefix("./") ? String(path.dropFirst(2)) : path, "line": data["line_number"] ?? 0, "content": String(content.prefix(2000)).trimmingCharacters(in: .newlines)])
        }
        return okJSON(["matches": matches, "total": matches.count, "pattern": args["pattern"] ?? "", "scanned": files.count, "truncated": files.count == 1000 || listing.truncated || matches.count == limit || output["truncated"] as? Bool == true], preview: "\(matches.count) matches")
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
        let requested = (args["maxChars"] as? NSNumber)?.doubleValue ?? 8000
        let maxChars = Int(min(60_000, max(1, requested)))
        var req = URLRequest(url: url)
        req.setValue("Supercode Desktop", forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 30
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: req)
        var data = Data()
        for try await byte in bytes {
            try Task.checkCancellation()
            data.append(byte)
            if data.count >= 200_000 { break }
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw NativeToolError("Fetch returned HTTP \(status)") }
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
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeToolError("URL returned no extractable text") }
        return okJSON([
            "bytesRead": data.count,
            "contentType": (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type") ?? "",
            "url": urlString,
            "status": status,
            "content": text,
        ], preview: "fetch \(url.host ?? urlString)")
    }

    // MARK: - Meta tools

    private static func question(args: [String: Any]) -> ToolExecutionResult {
        let questions = args["questions"] as? [[String: Any]] ?? []
        return okJSON(["type": "question", "questions": questions, "note": "Wait for the user's reply"], preview: questions.compactMap { $0["question"] as? String }.joined(separator: "\n"))
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

    static func okJSON(_ value: [String: Any], preview: String?) -> ToolExecutionResult {
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

    static func failJSON(cancelled: Bool, reason: String, denied: Bool = false) -> ToolExecutionResult {
        let payload: [String: Any] = [
            "success": false,
            "cancelled": cancelled,
            "reason": reason,
            "error": reason,
            "denied": denied,
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
        stringify(["success": value["success"] as? Bool ?? true, "data": value])
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
