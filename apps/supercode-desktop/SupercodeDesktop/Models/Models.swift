import Foundation
import CoreFoundation
import SwiftUI

enum AgentMode: String, CaseIterable, Identifiable, Codable {
    case chat
    case tools
    case plan
    case agent

    static func compatible(_ name: String) -> AgentMode {
        switch name {
        case "build", "general", "agent": return .agent
        case "explore", "chat": return .chat
        case "tools": return .tools
        default: return .plan
        }
    }

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chat: return "Chat"
        case .tools: return "Tools"
        case .plan: return "Plan"
        case .agent: return "Agent"
        }
    }

    var systemImage: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right"
        case .tools: return "wrench.and.screwdriver"
        case .plan: return "list.clipboard"
        case .agent: return "bolt.fill"
        }
    }
}

enum EffortLevel: String, CaseIterable, Identifiable, Codable {
    case low
    case medium
    case high

    var id: String { rawValue }

    var title: String {
        switch self {
        case .low: return "Low"
        case .medium: return "Medium"
        case .high: return "High"
        }
    }
}

enum FileBrowserTab: String, CaseIterable, Identifiable {
    case allFiles
    case changes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .allFiles: return "All files"
        case .changes: return "Changes"
        }
    }
}

struct WorkspaceNode: Identifiable, Hashable {
    let id: String
    let name: String
    let path: String
    let isDirectory: Bool
    var children: [WorkspaceNode]?

    init(name: String, path: String, isDirectory: Bool, children: [WorkspaceNode]? = nil) {
        self.id = path
        self.name = name
        self.path = path
        self.isDirectory = isDirectory
        self.children = children
    }

    var systemImage: String {
        if isDirectory { return "folder.fill" }
        switch (name as NSString).pathExtension.lowercased() {
        case "swift": return "swift"
        case "ts", "tsx", "js", "jsx": return "curlybraces"
        case "json", "yml", "yaml", "toml": return "doc.text"
        case "md": return "doc.richtext"
        case "png", "jpg", "jpeg", "gif", "svg", "webp": return "photo"
        case "sh", "bash", "zsh": return "terminal"
        default: return "doc"
        }
    }
}

enum AgentStatus: String, Equatable {
    case idle
    case thinking
    case streaming
    case tool
    case needsPermission
    case error

    var label: String {
        switch self {
        case .idle: return "Ready"
        case .thinking: return "Thinking"
        case .streaming: return "Streaming"
        case .tool: return "Running tool"
        case .needsPermission: return "Needs permission"
        case .error: return "Error"
        }
    }
}

struct SupercodeUser: Codable, Equatable, Identifiable {
    let id: String
    let name: String?
    let email: String?
    let image: String?
}

struct ConversationSummary: Identifiable, Codable, Equatable, Hashable {
    let id: String
    var title: String
    var mode: String
    var updatedAt: Date?
    var folder: String?

    var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "New conversation" : trimmed
    }
}

struct ChatMessage: Identifiable, Equatable, Codable {
    enum Role: String, Equatable, Codable {
        case user
        case assistant
        case system
        case tool
    }

    let id: String
    var role: Role
    var content: String
    var createdAt: Date
    var parts: [MessagePart]
    var canonicalHistory: [[String: AnyCodable]]?

    mutating func apply(_ part: MessagePart) {
        switch part {
        case .toolCall(let tool):
            if let index = parts.firstIndex(where: { $0.id == tool.id }) { parts[index] = part }
            else { parts.append(part) }
        case .text(let id, let chunk):
            content += chunk
            if case .text(let lastID, let text) = parts.last, lastID == id {
                parts[parts.count - 1] = .text(id: id, content: text + chunk)
            } else { parts.append(part) }
        case .reasoning(let id, let chunk):
            if case .reasoning(let lastID, let text) = parts.last, lastID == id {
                parts[parts.count - 1] = .reasoning(id: id, content: text + chunk)
            } else { parts.append(part) }
        }
    }

    init(
        id: String = UUID().uuidString,
        role: Role,
        content: String,
        createdAt: Date = Date(),
        parts: [MessagePart] = []
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.parts = parts
    }
}

enum MessagePart: Identifiable, Equatable, Codable {
    case text(id: String, content: String)
    case reasoning(id: String, content: String)
    case toolCall(ToolCallPart)

    var id: String {
        switch self {
        case .text(let id, _): return id
        case .reasoning(let id, _): return id
        case .toolCall(let part): return part.id
        }
    }
}

struct ToolCallPart: Identifiable, Equatable, Codable {
    let id: String
    var toolName: String
    var args: [String: AnyCodable]
    var status: ToolCallStatus
    var resultPreview: String?
    var durationMs: Int?
    var isExpanded: Bool
    var resultJSON: String?

    var displayName: String { TerminalContract.category(toolName) }

    var primaryArg: String {
        if let path = args["path"]?.stringValue { return path }
        if let query = args["query"]?.stringValue { return query }
        if let pattern = args["pattern"]?.stringValue { return pattern }
        if let command = args["command"]?.stringValue { return command }
        return toolName
    }
}

enum ToolCallStatus: String, Equatable, Codable {
    case queued
    case cancelled
    case denied
    case running
    case completed
    case failed
}

struct DiffFile: Identifiable, Equatable {
    let id: String
    var path: String
    /// Absolute path on disk when known.
    var absolutePath: String?
    var languageHint: String?
    var hunks: [DiffHunk]
    var isAccepted: Bool?
    /// Snapshot before mutation (for reject/revert).
    var previousContent: String?
    /// Content written by the agent.
    var newContent: String?
    /// True when the file was created by the agent (reject deletes it).
    var wasCreated: Bool

    init(
        id: String,
        path: String,
        absolutePath: String? = nil,
        languageHint: String? = nil,
        hunks: [DiffHunk],
        isAccepted: Bool? = nil,
        previousContent: String? = nil,
        newContent: String? = nil,
        wasCreated: Bool = false
    ) {
        self.id = id
        self.path = path
        self.absolutePath = absolutePath
        self.languageHint = languageHint
        self.hunks = hunks
        self.isAccepted = isAccepted
        self.previousContent = previousContent
        self.newContent = newContent
        self.wasCreated = wasCreated
    }

    var additions: Int { hunks.flatMap(\.lines).filter { $0.kind == .add }.count }
    var deletions: Int { hunks.flatMap(\.lines).filter { $0.kind == .remove }.count }
}

struct DiffHunk: Identifiable, Equatable {
    let id: String
    var header: String
    var lines: [DiffLine]
}

struct DiffLine: Identifiable, Equatable {
    enum Kind: Equatable {
        case context
        case add
        case remove
    }

    let id: String
    var kind: Kind
    var text: String
    var oldNumber: Int?
    var newNumber: Int?
}

struct PermissionRequest: Identifiable, Equatable {
    let id: String
    var toolName: String
    var summary: String
    var detail: String
    var resource: String
    var isDangerous: Bool

    init(
        id: String,
        toolName: String,
        summary: String,
        detail: String,
        resource: String = "*",
        isDangerous: Bool = false
    ) {
        self.id = id
        self.toolName = toolName
        self.summary = summary
        self.detail = detail
        self.resource = resource
        self.isDangerous = isDangerous
    }
}

struct AgentTodoItem: Identifiable, Equatable, Codable {
    var id: String
    var title: String
    var status: String
}

/// Type-erased Codable wrapper for tool args.
struct AnyCodable: Codable, Equatable, Hashable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map(\.value)
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues(\.value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() { try container.encode(number.boolValue) }
            else { try container.encode(number.doubleValue) }
            return
        }
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map(AnyCodable.init))
        case let dict as [String: Any]:
            try container.encode(dict.mapValues(AnyCodable.init))
        default:
            let context = EncodingError.Context(codingPath: container.codingPath, debugDescription: "Unsupported value")
            throw EncodingError.invalidValue(value, context)
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(String(describing: value))
    }

    var stringValue: String? {
        value as? String ?? (value as? CustomStringConvertible)?.description
    }
}

enum DeepLinkRouter {
    @MainActor
    static func handle(_ urls: [URL]) {
        for url in urls {
            guard url.scheme == "supercode" else { continue }
            let host = url.host ?? ""
            let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

            switch host {
            case "conversation":
                let id = path.isEmpty ? url.lastPathComponent : path
                NotificationCenter.default.post(name: .openConversation, object: id)
            case "workspace":
                if let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                   let pathValue = components.queryItems?.first(where: { $0.name == "path" })?.value {
                    WorkspaceStore.shared.openPath(pathValue)
                }
            default:
                if host.isEmpty, path.hasPrefix("conversation/") {
                    let id = String(path.dropFirst("conversation/".count))
                    NotificationCenter.default.post(name: .openConversation, object: id)
                }
            }
        }
    }
}
