import Foundation

struct ConnectedApp: Decodable, Identifiable, Equatable {
    let slug: String
    let name: String
    let description: String
    let logo: URL?
    let connected: Bool
    let connectedAccountId: String?

    var id: String { slug }
}

struct ComposioConnectResponse: Decodable {
    let connectedAccountId: String
    let redirectUrl: URL?
}

struct ComposioToolDefinition: Decodable {
    let name: String
    let displayName: String
    let description: String
    let parameters: [String: AnyCodable]
    let toolkit: String
    let toolkitName: String
    let requiresApproval: Bool

    var openAITool: [String: Any] {
        [
            "type": "function",
            "function": [
                "name": name,
                "description": description,
                "parameters": parameters.mapValues(\.value),
            ] as [String: Any],
        ]
    }
}

struct ConnectedAppsResponse: Decodable {
    let apps: [ConnectedApp]
}

struct ComposioToolsResponse: Decodable {
    let tools: [ComposioToolDefinition]
}

enum NovaConnectorProvider: String, Decodable, CaseIterable, Identifiable {
    case slack
    case linear
    case github

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .slack: return "Slack"
        case .linear: return "Linear"
        case .github: return "GitHub"
        }
    }

    var systemImage: String {
        switch self {
        case .slack: return "number"
        case .linear: return "line.3.horizontal.decrease.circle"
        case .github: return "chevron.left.forwardslash.chevron.right"
        }
    }
}

struct NovaBotInstallation: Decodable, Equatable {
    let contractVersion: String
    let id: String
    let provider: NovaConnectorProvider
    let externalAccountId: String
    let externalAccountName: String?
    let botExternalUserId: String?
    let health: String
    let webhookHealth: String
    let grantedScopes: [String]
    let missingScopes: [String]
    let canReceiveMessages: Bool
    let canReplyAsNova: Bool
    let lastHealthCheckAt: String?
    let lastEventAt: String?
}

struct NovaDelegatedConnection: Decodable, Equatable {
    let contractVersion: String
    let id: String
    let provider: NovaConnectorProvider
    let externalAccountId: String
    let grantedScopes: [String]
    let status: String
    let expiresAt: String?
}

struct NovaConnectorStatus: Decodable, Identifiable, Equatable {
    let provider: NovaConnectorProvider
    let botInstallation: NovaBotInstallation?
    let delegatedConnection: NovaDelegatedConnection?
    let ready: Bool
    let statusMessage: String?
    let authorizeUrl: URL?
    let testConversationUrl: URL?

    var id: String { provider.rawValue }

    var stateLabel: String {
        if ready { return "Ready" }
        if botInstallation == nil { return "Not installed" }
        if !(botInstallation?.missingScopes.isEmpty ?? true) { return "Permissions needed" }
        return "Verifying"
    }
}

struct NovaConnectorsResponse: Decodable {
    let connectors: [NovaConnectorStatus]
}

struct NovaSessionSurface: Decodable, Identifiable, Equatable {
    let id: String
    let provider: String
    let externalSurfaceId: String
    let externalContainerId: String?
    let externalUrl: URL?
    let status: String
}

struct NovaSessionSummary: Decodable, Identifiable, Equatable {
    let contractVersion: String
    let id: String
    let objective: String
    let mode: String
    let status: String
    let activeRunId: String?
    let latestSequence: Int
    let surfaces: [NovaSessionSurface]
    let updatedAt: String

    var sourceLabel: String {
        let providers = Set(surfaces.map(\.provider))
        return providers.sorted().joined(separator: " · ").capitalized
    }
}

struct NovaSessionsResponse: Decodable {
    let sessions: [NovaSessionSummary]
}

struct NovaSessionResponse: Decodable {
    let session: NovaSessionSummary
}

struct NovaSessionMessage: Decodable, Identifiable, Equatable {
    let id: String
    let sessionId: String
    let surfaceId: String?
    let sequence: Int
    let role: String
    let content: String
    let senderType: String?
    let senderId: String?
    let createdAt: String
}

struct NovaSessionActivity: Decodable, Identifiable, Equatable {
    let id: String
    let sessionId: String
    let runId: String?
    let sequence: Int
    let type: String
    let status: String
    let title: String?
    let body: String?
    let data: [String: AnyCodable]?
    let createdAt: String
}

struct NovaSessionSync: Decodable, Equatable {
    let contractVersion: String
    let sessionId: String
    let afterSequence: Int
    let messages: [NovaSessionMessage]
    let activities: [NovaSessionActivity]
    let nextSequence: Int
    let hasMore: Bool
}

struct NovaApproval: Decodable, Identifiable, Equatable {
    let contractVersion: String
    let id: String
    let sessionId: String
    let runId: String
    let toolInvocationId: String?
    let capability: String
    let normalizedArgsHash: String
    let mutation: NovaMutationPreview?
    let status: String
    let expiresAt: String
    let decidedAt: String?
    let createdAt: String

    var isPending: Bool { status == "pending" }
}

struct NovaMutationPreview: Decodable, Equatable {
    let tool: String
    let text: String
    let target: NovaMutationTarget
}

struct NovaMutationTarget: Decodable, Equatable {
    let channelId: String?
    let threadTimestamp: String?
    let agentSessionId: String?
    let repository: String?
    let issueNumber: Int?

    var description: String {
        if let repository, let issueNumber { return "\(repository)#\(issueNumber)" }
        if let channelId { return "Slack channel \(channelId)" }
        if let agentSessionId { return "Linear session \(agentSessionId)" }
        return "Current conversation"
    }
}

struct NovaApprovalsResponse: Decodable {
    let contractVersion: String
    let approvals: [NovaApproval]
}

struct NovaApprovalResponse: Decodable {
    let approval: NovaApproval
}
