import AppKit
import Foundation

@MainActor
final class ConnectionsStore: ObservableObject {
    static let shared = ConnectionsStore()

    @Published private(set) var apps: [ConnectedApp] = []
    @Published private(set) var novaConnectors: [NovaConnectorStatus] = []
    @Published private(set) var novaSessions: [NovaSessionSummary] = []
    @Published private(set) var novaMessages: [String: [NovaSessionMessage]] = [:]
    @Published private(set) var novaActivities: [String: [NovaSessionActivity]] = [:]
    @Published private(set) var novaApprovals: [NovaApproval] = []
    @Published var selectedNovaSessionId: String?
    @Published private(set) var decidingApprovalId: String?
    @Published private(set) var isLoading = false
    @Published private(set) var connectingSlug: String?
    @Published private(set) var installingNovaProvider: NovaConnectorProvider?
    @Published private(set) var disconnectingSlug: String?
    @Published var errorMessage: String?

    private var tools: [ComposioToolDefinition] = []
    private var hasLoadedTools = false
    private var connectionTask: Task<Void, Never>?
    private var novaCursors: [String: Int] = [:]

    var connectedCount: Int { apps.filter(\.connected).count }
    var readyNovaConnectorCount: Int { novaConnectors.filter(\.ready).count }
    var availableToolCount: Int { tools.count }
    var selectedNovaSession: NovaSessionSummary? {
        guard let selectedNovaSessionId else { return nil }
        return novaSessions.first { $0.id == selectedNovaSessionId }
    }
    var pendingNovaApprovals: [NovaApproval] {
        novaApprovals.filter(\.isPending)
    }

    func approvals(for sessionId: String) -> [NovaApproval] {
        pendingNovaApprovals.filter { $0.sessionId == sessionId }
    }

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
            async let novaRequest = SupercodeAPIClient.shared.listNovaConnectors()
            async let sessionsRequest = SupercodeAPIClient.shared.listNovaSessions()
            async let approvalsRequest = SupercodeAPIClient.shared.listNovaApprovals()
            async let appsRequest = SupercodeAPIClient.shared.listConnectedApps()
            async let toolsRequest = SupercodeAPIClient.shared.listComposioTools()
            novaConnectors = try await novaRequest
            novaSessions = try await sessionsRequest
            novaApprovals = try await approvalsRequest
            if let selectedNovaSessionId,
               !novaSessions.contains(where: { $0.id == selectedNovaSessionId }) {
                self.selectedNovaSessionId = nil
            }
            apps = try await appsRequest
            tools = try await toolsRequest
            hasLoadedTools = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadToolsIfNeeded() async {
        guard !hasLoadedTools else { return }
        await refresh()
    }

    func selectNovaSession(_ sessionId: String) async {
        selectedNovaSessionId = sessionId
        await syncNovaSession(sessionId)
    }

    func createNovaSession(objective: String) async -> NovaSessionSummary? {
        do {
            let session = try await SupercodeAPIClient.shared.createNovaSession(objective: objective)
            novaSessions.removeAll { $0.id == session.id }
            novaSessions.insert(session, at: 0)
            selectedNovaSessionId = session.id
            await syncNovaSession(session.id)
            return session
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func syncNovaSession(_ sessionId: String) async {
        do {
            async let approvalsRequest = SupercodeAPIClient.shared.listNovaApprovals()
            var cursor = novaCursors[sessionId] ?? 0
            repeat {
                let page = try await SupercodeAPIClient.shared.syncNovaSession(id: sessionId, after: cursor)
                var messages = novaMessages[sessionId] ?? []
                var activities = novaActivities[sessionId] ?? []
                let messageIds = Set(messages.map(\.id))
                let activityIds = Set(activities.map(\.id))
                messages.append(contentsOf: page.messages.filter { !messageIds.contains($0.id) })
                activities.append(contentsOf: page.activities.filter { !activityIds.contains($0.id) })
                novaMessages[sessionId] = messages.sorted { $0.sequence < $1.sequence }
                novaActivities[sessionId] = activities.sorted { $0.sequence < $1.sequence }
                cursor = page.nextSequence
                novaCursors[sessionId] = cursor
                if !page.hasMore { break }
            } while !Task.isCancelled
            novaApprovals = try await approvalsRequest
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func decideNovaApproval(_ approval: NovaApproval, decision: String) async {
        guard decidingApprovalId == nil, approval.isPending else { return }
        decidingApprovalId = approval.id
        errorMessage = nil
        defer { decidingApprovalId = nil }
        do {
            let updated = try await SupercodeAPIClient.shared.decideNovaApproval(
                approval,
                decision: decision
            )
            if let index = novaApprovals.firstIndex(where: { $0.id == updated.id }) {
                novaApprovals[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
            try? await refreshNovaApprovals()
        }
    }

    func refreshNovaApprovals() async throws {
        novaApprovals = try await SupercodeAPIClient.shared.listNovaApprovals()
    }

    func installNova(_ connector: NovaConnectorStatus) {
        guard installingNovaProvider == nil else { return }
        guard let url = connector.authorizeUrl else {
            errorMessage = "Nova \(connector.provider.displayName) installation is not configured on the server."
            return
        }
        connectionTask?.cancel()
        installingNovaProvider = connector.provider
        errorMessage = nil
        NSWorkspace.shared.open(url)
        connectionTask = Task {
            defer { installingNovaProvider = nil }
            do {
                let deadline = Date().addingTimeInterval(180)
                while !Task.isCancelled && Date() < deadline {
                    try await Task.sleep(for: .seconds(2))
                    let updated = try await SupercodeAPIClient.shared.listNovaConnectors()
                    novaConnectors = updated
                    if let current = updated.first(where: { $0.provider == connector.provider }),
                       current.ready || current.botInstallation != nil {
                        return
                    }
                }
                if !Task.isCancelled {
                    errorMessage = "Installation is still pending. Finish it in your browser, then refresh."
                }
            } catch is CancellationError {
                return
            } catch {
                errorMessage = error.localizedDescription
            }
        }
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
        novaConnectors = []
        novaSessions = []
        novaMessages = [:]
        novaActivities = [:]
        novaApprovals = []
        selectedNovaSessionId = nil
        decidingApprovalId = nil
        novaCursors = [:]
        tools = []
        hasLoadedTools = false
        connectingSlug = nil
        installingNovaProvider = nil
        disconnectingSlug = nil
        errorMessage = nil
    }
}
