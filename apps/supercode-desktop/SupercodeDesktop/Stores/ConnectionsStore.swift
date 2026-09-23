import AppKit
import Foundation

@MainActor
final class ConnectionsStore: ObservableObject {
    static let shared = ConnectionsStore()

    @Published private(set) var apps: [ConnectedApp] = []
    @Published private(set) var isLoading = false
    @Published private(set) var connectingSlug: String?
    @Published private(set) var disconnectingSlug: String?
    @Published var errorMessage: String?

    private var tools: [ComposioToolDefinition] = []
    private var hasLoadedTools = false
    private var connectionTask: Task<Void, Never>?

    var connectedCount: Int { apps.filter(\.connected).count }
    var availableToolCount: Int { tools.count }

    func cachedToolDefinitions(for mode: AgentMode) -> [[String: Any]] {
        tools
            .filter { mode != .plan || !$0.requiresApproval }
            .map(\.openAITool)
    }

    private init() {}

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            apps = try await SupercodeAPIClient.shared.listConnectedApps()
            tools = try await SupercodeAPIClient.shared.listComposioTools()
            hasLoadedTools = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadToolsIfNeeded() async {
        guard !hasLoadedTools else { return }
        await refresh()
    }

    func connect(_ app: ConnectedApp) {
        guard connectingSlug == nil else { return }
        connectionTask?.cancel()
        connectingSlug = app.slug
        errorMessage = nil
        connectionTask = Task {
            defer { connectingSlug = nil }
            do {
                let connection = try await SupercodeAPIClient.shared.connectApp(slug: app.slug)
                guard let url = connection.redirectUrl else {
                    throw APIError.server("The connection provider did not return an authorization URL")
                }
                NSWorkspace.shared.open(url)

                let deadline = Date().addingTimeInterval(120)
                while !Task.isCancelled && Date() < deadline {
                    try await Task.sleep(for: .seconds(2))
                    let updatedApps = try await SupercodeAPIClient.shared.listConnectedApps()
                    apps = updatedApps
                    if updatedApps.contains(where: { $0.slug == app.slug && $0.connected }) {
                        tools = try await SupercodeAPIClient.shared.listComposioTools()
                        hasLoadedTools = true
                        return
                    }
                }
                if !Task.isCancelled {
                    errorMessage = "Authorization is still pending. Finish it in your browser, then refresh."
                }
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func disconnect(_ app: ConnectedApp) async {
        guard let accountId = app.connectedAccountId else { return }
        disconnectingSlug = app.slug
        errorMessage = nil
        defer { disconnectingSlug = nil }
        do {
            try await SupercodeAPIClient.shared.disconnectApp(connectedAccountId: accountId)
            apps = try await SupercodeAPIClient.shared.listConnectedApps()
            tools = try await SupercodeAPIClient.shared.listComposioTools()
            hasLoadedTools = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func hasTool(named name: String) -> Bool {
        tools.contains { $0.name == name }
    }

    func execute(name: String, arguments: [String: Any]) async -> ToolExecutionResult {
        guard let tool = tools.first(where: { $0.name == name }) else {
            return LocalToolRuntime.failJSON(cancelled: false, reason: "Connected tool is no longer available")
        }
        if tool.requiresApproval {
            let allowed = await PermissionManager.shared.authorizeExternal(
                toolName: tool.name,
                args: arguments
            )
            guard allowed else {
                return LocalToolRuntime.failJSON(cancelled: false, reason: "Permission denied by user", denied: true)
            }
        }

        do {
            let object = try await SupercodeAPIClient.shared.executeComposioTool(name: name, arguments: arguments)
            let data = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
            let json = String(data: data, encoding: .utf8) ?? "{}"
            let success = object["successful"] as? Bool ?? object["error"] == nil
            let preview: String
            if let error = object["error"] as? String, !error.isEmpty {
                preview = error
            } else if let value = object["data"] as? String {
                preview = String(value.prefix(180))
            } else {
                preview = success ? "Completed in \(tool.toolkitName)" : "Connected tool failed"
            }
            return ToolExecutionResult(
                json: json,
                success: success,
                cancelled: false,
                mutatedAbsolutePath: nil,
                mutatedRelativePath: nil,
                previousContent: nil,
                newContent: nil,
                preview: preview
            )
        } catch {
            return LocalToolRuntime.failJSON(cancelled: Task.isCancelled, reason: error.localizedDescription)
        }
    }

    func reset() {
        connectionTask?.cancel()
        connectionTask = nil
        apps = []
        tools = []
        hasLoadedTools = false
        connectingSlug = nil
        disconnectingSlug = nil
        errorMessage = nil
    }
}
