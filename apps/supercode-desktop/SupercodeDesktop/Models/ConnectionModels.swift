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
