import Foundation

enum ModelSource: String, Codable {
    case supercode
    case openCode
}

struct OpenCodeModel: Identifiable, Equatable, Hashable {
    let providerID: String
    let providerName: String
    let modelID: String
    let name: String
    let supportsReasoning: Bool
    let supportsTools: Bool
    let variants: [String]

    var id: String { "\(providerID)::\(modelID)" }

    var chipLabel: String {
        "OpenCode · \(name)"
    }
}

enum OpenCodeConnectionState: Equatable {
    case idle
    case starting
    case connected(version: String)
    case unavailable(String)

    var label: String {
        switch self {
        case .idle: return "Not connected"
        case .starting: return "Starting OpenCode…"
        case .connected(let version): return "Connected · v\(version)"
        case .unavailable(let message): return message
        }
    }
}
