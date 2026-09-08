import Foundation

enum PermissionDecision: String, Equatable {
    case once
    case always
    case deny
}

@MainActor
final class PermissionManager: ObservableObject {
    static let shared = PermissionManager()

    @Published var pending: PermissionRequest?

    /// toolName -> always-allow
    private var alwaysAllowTools: Set<String> = []
    /// toolName|resource pattern always allow
    private var alwaysAllowKeys: Set<String> = []
    private var continuation: CheckedContinuation<PermissionDecision, Never>?

    private init() {
        if let saved = UserDefaults.standard.array(forKey: "permissionAlwaysTools") as? [String] {
            alwaysAllowTools = Set(saved)
        }
        if let saved = UserDefaults.standard.array(forKey: "permissionAlwaysKeys") as? [String] {
            alwaysAllowKeys = Set(saved)
        }
    }

    func resetSessionAllows() {
        // Keep persisted always; nothing session-only yet.
    }

    func clearAlwaysAllows() {
        alwaysAllowTools.removeAll()
        alwaysAllowKeys.removeAll()
        persist()
    }

    /// Returns true if the tool may run without prompting.
    func isPreauthorized(toolName: String, args: [String: Any], mode: AgentMode) -> Bool {
        // Plan/chat never get write/exec even if previously allowed.
        if mode == .plan || mode == .chat {
            if ToolCatalog.requiresPermission(toolName) {
                return false
            }
        }

        if alwaysAllowTools.contains(toolName) {
            return true
        }

        let resource = resourceKey(toolName: toolName, args: args)
        if alwaysAllowKeys.contains("\(toolName)|\(resource)") {
            return true
        }

        // Shell prefixes cannot establish safety: substitutions, redirects and compound commands may mutate files.
        // Commands require an explicit user grant, including apparently read-only commands.

        if !ToolCatalog.requiresPermission(toolName) {
            return true
        }

        return false
    }

    /// Prompt the user if needed. Returns whether execution may proceed.
    func authorize(toolName: String, args: [String: Any], mode: AgentMode) async -> Bool {
        if isPreauthorized(toolName: toolName, args: args, mode: mode) {
            // Still block write tools in plan/chat
            if (mode == .plan || mode == .chat) && ToolCatalog.requiresPermission(toolName) {
                return false
            }
            return true
        }

        if (mode == .plan || mode == .chat) && ToolCatalog.requiresPermission(toolName) {
            return false
        }

        let resource = resourceKey(toolName: toolName, args: args)
        let summary = summaryLine(toolName: toolName, args: args)
        let detail = detailBlock(toolName: toolName, args: args)
        let request = PermissionRequest(
            id: UUID().uuidString,
            toolName: toolName,
            summary: summary,
            detail: detail,
            resource: resource,
            isDangerous: ToolCatalog.isDestructive(toolName, args: args)
        )

        let decision: PermissionDecision = await withCheckedContinuation { cont in
            // Cancel any previous pending prompt as deny
            if let existing = continuation {
                existing.resume(returning: .deny)
            }
            continuation = cont
            pending = request
        }

        if pending?.id == request.id {
            pending = nil
            continuation = nil
        }

        switch decision {
        case .once:
            return true
        case .always:
            alwaysAllowTools.insert(toolName)
            alwaysAllowKeys.insert("\(toolName)|\(resource)")
            persist()
            return true
        case .deny:
            return false
        }
    }

    func resolve(_ decision: PermissionDecision) {
        continuation?.resume(returning: decision)
        continuation = nil
        pending = nil
    }

    private func persist() {
        UserDefaults.standard.set(Array(alwaysAllowTools), forKey: "permissionAlwaysTools")
        UserDefaults.standard.set(Array(alwaysAllowKeys), forKey: "permissionAlwaysKeys")
    }

    private func resourceKey(toolName: String, args: [String: Any]) -> String {
        if let path = args["path"] as? String { return path }
        if let cmd = args["command"] as? String { return String(cmd.prefix(120)) }
        if let code = args["code"] as? String { return String(code.prefix(80)) }
        if let url = args["url"] as? String { return url }
        return "*"
    }

    private func summaryLine(toolName: String, args: [String: Any]) -> String {
        switch toolName {
        case "write_file":
            return "Write \(args["path"] as? String ?? "file")"
        case "edit_file":
            return "Edit \(args["path"] as? String ?? "file")"
        case "run_command":
            return "Run: \(args["command"] as? String ?? "")"
        case "code_exec":
            return "Execute code"
        default:
            return toolName
        }
    }

    private func detailBlock(toolName: String, args: [String: Any]) -> String {
        switch toolName {
        case "write_file":
            let path = args["path"] as? String ?? ""
            let content = args["content"] as? String ?? ""
            let preview = content.split(separator: "\n").prefix(40).joined(separator: "\n")
            return "path: \(path)\n\n\(preview)"
        case "edit_file":
            let path = args["path"] as? String ?? ""
            let old = args["oldText"] as? String ?? ""
            let new = args["newText"] as? String ?? ""
            return "path: \(path)\n\n- \(old.prefix(500))\n+ \(new.prefix(500))"
        case "run_command":
            let cmd = args["command"] as? String ?? ""
            let cwd = args["cwd"] as? String ?? "."
            let desc = args["description"] as? String ?? ""
            return "cwd: \(cwd)\n\(desc.isEmpty ? "" : desc + "\n")$ \(cmd)"
        case "code_exec":
            return args["code"] as? String ?? ""
        default:
            return args.map { "\($0.key): \($0.value)" }.sorted().joined(separator: "\n")
        }
    }
}
