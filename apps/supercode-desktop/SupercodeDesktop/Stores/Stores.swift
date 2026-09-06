import AppKit
import Combine
import Foundation
import SwiftUI

@MainActor
final class AppSessionStore: ObservableObject {
    static let shared = AppSessionStore()

    @Published var user: SupercodeUser?
    @Published var isAuthenticated = false
    @Published var isBootstrapping = true
    @Published var isAuthenticating = false
    @Published var authError: String?
    @Published var deviceUserCode: String?
    @Published var verificationURL: URL?
@Published var serverURL: String
    @Published var selectedProvider: String
    @Published var selectedModel: String
    @Published var selectedEffort: EffortLevel = .low
    @Published var avatarImage: NSImage?

    private var pollTask: Task<Void, Never>?
    private var avatarTask: Task<Void, Never>?

    private let providerDefaultsKey = "selectedProvider"
    private let modelDefaultsKey = "selectedModel"
    private let effortDefaultsKey = "selectedEffort"

    private init() {
        // Prefer UserDefaults so launch never hits Keychain for a non-secret preference.
        serverURL = UserDefaults.standard.string(forKey: "serverURL")
            ?? UserDefaults.standard.string(forKey: "ai.supercode.desktop.serverURL")
            ?? KeychainStore.get(.serverURL)
            ?? "https://supercode-8w7e.onrender.com"

        let storedProvider = UserDefaults.standard.string(forKey: providerDefaultsKey)
            ?? ModelCatalog.defaultProvider.rawValue
        let storedModel = UserDefaults.standard.string(forKey: modelDefaultsKey)
            ?? ModelCatalog.defaultModelId
        let resolved = ModelCatalog.resolve(provider: storedProvider, model: storedModel)
        selectedProvider = resolved.0.rawValue
        selectedModel = resolved.1.id

        if let effortRaw = UserDefaults.standard.string(forKey: effortDefaultsKey),
           let effort = EffortLevel(rawValue: effortRaw) {
            selectedEffort = effort
        }
    }

    /// Select a catalog model — updates both provider and model and persists.
    func selectModel(_ entry: ModelCatalog.ModelEntry) {
        selectedProvider = entry.provider.rawValue
        selectedModel = entry.id
        UserDefaults.standard.set(selectedProvider, forKey: providerDefaultsKey)
        UserDefaults.standard.set(selectedModel, forKey: modelDefaultsKey)
    }

    func selectProvider(_ provider: ModelCatalog.Provider) {
        selectedProvider = provider.rawValue
        if ModelCatalog.find(provider: provider.rawValue, model: selectedModel) == nil {
            selectedModel = provider.defaultModelId
        }
        UserDefaults.standard.set(selectedProvider, forKey: providerDefaultsKey)
        UserDefaults.standard.set(selectedModel, forKey: modelDefaultsKey)
    }

    var selectedModelEntry: ModelCatalog.ModelEntry {
        ModelCatalog.resolve(provider: selectedProvider, model: selectedModel).1
    }

    var modelChipLabel: String {
        ModelCatalog.displayChip(provider: selectedProvider, model: selectedModel)
    }

    func persistEffort(_ level: EffortLevel) {
        selectedEffort = level
        UserDefaults.standard.set(level.rawValue, forKey: effortDefaultsKey)
    }

    func bootstrap() {
        isBootstrapping = true
        Task {
            defer { isBootstrapping = false }
            if let token = KeychainStore.get(.accessToken), !token.isEmpty {
                do {
let me = try await SupercodeAPIClient.shared.getCurrentUser()
                    user = me
                    isAuthenticated = true
                    loadAvatar(from: me.image)
                    await ConversationStore.shared.refreshList()
                } catch {
                    KeychainStore.clearAuth()
                    isAuthenticated = false
                    user = nil
                }
            }
        }
    }

    func updateServerURL(_ url: String) {
        serverURL = url.trimmingCharacters(in: .whitespacesAndNewlines)
        KeychainStore.set(serverURL, for: .serverURL)
        UserDefaults.standard.set(serverURL, forKey: "serverURL")
    }

    func startLogin() {
        authError = nil
        isAuthenticating = true
        deviceUserCode = nil
        verificationURL = nil
        pollTask?.cancel()

        pollTask = Task {
            do {
                let code = try await SupercodeAPIClient.shared.requestDeviceCode()
                deviceUserCode = code.userCode
                let urlString = code.verificationUriComplete ?? code.verificationUri
                verificationURL = URL(string: urlString)
                if let url = verificationURL {
                    NSWorkspace.shared.open(url)
                }

let interval = max(code.interval, 3)
                let deadline = Date().addingTimeInterval(TimeInterval(code.expiresIn))
                while Date() < deadline {
                    try Task.checkCancellation()
                    try await Task.sleep(nanoseconds: UInt64(interval) * 1_000_000_000)
                    if let token = try await SupercodeAPIClient.shared.pollDeviceToken(deviceCode: code.deviceCode) {
                        persist(token: token)
let me = try await SupercodeAPIClient.shared.getCurrentUser()
                        user = me
                        isAuthenticated = true
                        isAuthenticating = false
                        deviceUserCode = nil
                        loadAvatar(from: me.image)
                        await ConversationStore.shared.refreshList()
                        return
                    }
                }
                authError = "Device code expired. Try again."
                isAuthenticating = false
            } catch is CancellationError {
                isAuthenticating = false
            } catch {
                authError = error.localizedDescription
                isAuthenticating = false
            }
        }
    }

    func cancelLogin() {
        pollTask?.cancel()
        isAuthenticating = false
        deviceUserCode = nil
        verificationURL = nil
    }

func signOut() {
        KeychainStore.clearAuth()
        user = nil
        isAuthenticated = false
        avatarImage = nil
        avatarTask?.cancel()
        ConversationStore.shared.reset()
        AgentRunStore.shared.reset()
    }

    func loadAvatar(from urlString: String?) {
        avatarTask?.cancel()
        guard let urlString, let url = URL(string: urlString) else {
            avatarImage = nil
            return
        }
        avatarTask = Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let image = NSImage(data: data) {
                    avatarImage = image
                }
            } catch {
                // Keep initials fallback
            }
        }
    }

    var machineDisplayName: String {
        if let name = Host.current().localizedName, !name.isEmpty {
            return name
        }
        return Host.current().name ?? "This Mac"
    }

    var accountDisplayName: String {
        if let name = user?.name, !name.isEmpty { return name }
        if let email = user?.email, !email.isEmpty { return email }
        return "Signed in"
    }

    /// Dev/helper: import bearer token already obtained via CLI (`~/.better-auth/token.json`).
    func importTokenFromCLIIfAvailable() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let path = home.appendingPathComponent(".better-auth/token.json")
        guard let data = try? Data(contentsOf: path),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let access = obj["access_token"] as? String
        else { return }
        KeychainStore.set(access, for: .accessToken)
        if let refresh = obj["refresh_token"] as? String {
            KeychainStore.set(refresh, for: .refreshToken)
        }
        if let expires = obj["expires_at"] as? String {
            KeychainStore.set(expires, for: .expiresAt)
        }
        bootstrap()
    }

    private func persist(token: TokenResponse) {
        KeychainStore.set(token.accessToken, for: .accessToken)
        if let refresh = token.refreshToken {
            KeychainStore.set(refresh, for: .refreshToken)
        }
        KeychainStore.set(token.tokenType ?? "Bearer", for: .tokenType)
        if let expiresIn = token.expiresIn {
            let expiresAt = Date().addingTimeInterval(TimeInterval(expiresIn))
            KeychainStore.set(ISO8601DateFormatter().string(from: expiresAt), for: .expiresAt)
        }
        KeychainStore.set(serverURL, for: .serverURL)
    }
}

@MainActor
final class WorkspaceStore: ObservableObject {
    static let shared = WorkspaceStore()

@Published var path: String?
    @Published var displayName: String = "No workspace"
    @Published var gitBranch: String?
    @Published var bookmarkData: Data?
    @Published var pendingPermission: PermissionRequest?
    @Published var rootNodes: [WorkspaceNode] = []
    @Published var isLoadingTree = false
    @Published var treeError: String?
    @Published var expandedPaths: Set<String> = []
    @Published var selectedPath: String?
    @Published var fileBrowserTab: FileBrowserTab = .allFiles

    private let defaultsKey = "workspaceBookmark"
    private let pathKey = "workspacePath"
    private let ignoredNames: Set<String> = [
        ".git", "node_modules", ".next", "dist", "build", ".turbo",
        "DerivedData", ".DS_Store", "xcuserdata", ".cache",
    ]

    private init() {
        if let data = UserDefaults.standard.data(forKey: defaultsKey) {
            bookmarkData = data
            restoreBookmark()
        } else if let saved = UserDefaults.standard.string(forKey: pathKey) {
            openPath(saved)
        }
    }

    func pickWorkspace() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Open Workspace"
        panel.message = "Choose a project folder for the coding agent"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        consumeWorkspaceURL(url)
    }

    func openPath(_ raw: String) {
        let url = URL(fileURLWithPath: (raw as NSString).expandingTildeInPath)
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        consumeWorkspaceURL(url)
    }

    private func consumeWorkspaceURL(_ url: URL) {
        do {
            let data = try url.bookmarkData(
                options: [.withSecurityScope],
                includingResourceValuesForKeys: nil,
                relativeTo: nil
            )
            bookmarkData = data
            UserDefaults.standard.set(data, forKey: defaultsKey)
        } catch {
            // Still open without bookmark if sandbox is off.
        }
path = url.path
        displayName = url.lastPathComponent
        UserDefaults.standard.set(url.path, forKey: pathKey)
        refreshGitBranch()
        reloadTree()
        AgentRunStore.shared.isInspectorVisible = true
    }

    func clearWorkspace() {
        path = nil
        displayName = "No workspace"
        gitBranch = nil
        rootNodes = []
        expandedPaths = []
        selectedPath = nil
        treeError = nil
        UserDefaults.standard.removeObject(forKey: pathKey)
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        bookmarkData = nil
    }

    func reloadTree() {
        guard let path else {
            rootNodes = []
            return
        }
        isLoadingTree = true
        treeError = nil
        let ignored = ignoredNames
        Task.detached(priority: .userInitiated) {
            do {
                let nodes = try WorkspaceStore.buildChildren(of: path, depth: 0, maxDepth: 2, ignoredNames: ignored)
                await MainActor.run {
                    self.rootNodes = nodes
                    self.expandedPaths = [path]
                    self.isLoadingTree = false
                }
            } catch {
                await MainActor.run {
                    self.treeError = error.localizedDescription
                    self.rootNodes = []
                    self.isLoadingTree = false
                }
            }
        }
    }

    func toggleExpanded(_ node: WorkspaceNode) {
        guard node.isDirectory else {
            selectedPath = node.path
            return
        }
        if expandedPaths.contains(node.path) {
            expandedPaths.remove(node.path)
        } else {
            expandedPaths.insert(node.path)
            ensureChildrenLoaded(for: node)
        }
    }

    private func ensureChildrenLoaded(for node: WorkspaceNode) {
        guard node.isDirectory else { return }
        // Rebuild shallow tree branch if children missing
        if node.children == nil || node.children?.isEmpty == true {
            let ignored = ignoredNames
            let nodePath = node.path
            Task.detached(priority: .userInitiated) {
                let children = (try? WorkspaceStore.buildChildren(of: nodePath, depth: 0, maxDepth: 1, ignoredNames: ignored)) ?? []
                await MainActor.run {
                    self.rootNodes = self.replacingChildren(in: self.rootNodes, path: nodePath, children: children)
                }
            }
        }
    }

    private func replacingChildren(in nodes: [WorkspaceNode], path: String, children: [WorkspaceNode]) -> [WorkspaceNode] {
        nodes.map { node in
            if node.path == path {
                return WorkspaceNode(name: node.name, path: node.path, isDirectory: true, children: children)
            }
            if let kids = node.children {
                return WorkspaceNode(
                    name: node.name,
                    path: node.path,
                    isDirectory: node.isDirectory,
                    children: replacingChildren(in: kids, path: path, children: children)
                )
            }
            return node
        }
    }

    nonisolated private static func buildChildren(
        of directory: String,
        depth: Int,
        maxDepth: Int,
        ignoredNames: Set<String>
    ) throws -> [WorkspaceNode] {
        let fm = FileManager.default
        let url = URL(fileURLWithPath: directory)
        let contents = try fm.contentsOfDirectory(
            at: url,
            includingPropertiesForKeys: [.isDirectoryKey, .isHiddenKey, .nameKey],
            options: [.skipsPackageDescendants]
        )
        var nodes: [WorkspaceNode] = []
        for child in contents {
            let name = child.lastPathComponent
            if ignoredNames.contains(name) { continue }
            let values = try child.resourceValues(forKeys: [.isDirectoryKey, .isHiddenKey])
            if values.isHidden == true && !name.hasPrefix(".") { continue }
            let isDir = values.isDirectory == true
            var kids: [WorkspaceNode]?
            if isDir, depth < maxDepth {
                kids = try buildChildren(of: child.path, depth: depth + 1, maxDepth: maxDepth, ignoredNames: ignoredNames)
            } else if isDir {
                kids = []
            }
            nodes.append(WorkspaceNode(name: name, path: child.path, isDirectory: isDir, children: kids))
        }
        return nodes.sorted { lhs, rhs in
            if lhs.isDirectory != rhs.isDirectory { return lhs.isDirectory && !rhs.isDirectory }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

private func restoreBookmark() {
        guard let data = bookmarkData else { return }
        var isStale = false
        do {
            let url = try URL(
                resolvingBookmarkData: data,
                options: [.withSecurityScope],
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
_ = url.startAccessingSecurityScopedResource()
            path = url.path
            displayName = url.lastPathComponent
            if isStale {
                consumeWorkspaceURL(url)
            } else {
                refreshGitBranch()
                reloadTree()
            }
        } catch {
            self.bookmarkData = nil
        }
    }

    func refreshGitBranch() {
        guard let path else {
            gitBranch = nil
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["-C", path, "rev-parse", "--abbrev-ref", "HEAD"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let branch = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            gitBranch = (process.terminationStatus == 0) ? branch : nil
        } catch {
            gitBranch = nil
        }
    }

    func breadcrumbSegments() -> [String] {
        guard let path else { return ["Supercode"] }
        let parts = path.split(separator: "/").map(String.init)
        return Array(parts.suffix(3))
    }
}

@MainActor
final class ConversationStore: ObservableObject {
    static let shared = ConversationStore()

    @Published var conversations: [ConversationSummary] = []
    @Published var activeConversationId: String?
    @Published var messages: [ChatMessage] = []
    @Published var mode: AgentMode = .agent
    @Published var searchQuery: String = ""
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let localCacheKey = "localConversations"

    private init() {
        loadLocalCache()
NotificationCenter.default.addObserver(
            forName: .openConversation,
            object: nil,
            queue: .main
        ) { note in
            guard let id = note.object as? String else { return }
            Task { @MainActor in
                await ConversationStore.shared.selectConversation(id: id)
            }
        }
    }

    var filteredConversations: [ConversationSummary] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return conversations }
        return conversations.filter {
            $0.displayTitle.lowercased().contains(q) || $0.id.lowercased().contains(q)
        }
    }

    var workConversations: [ConversationSummary] {
        filteredConversations.filter { ($0.folder ?? "Work") == "Work" }
    }

    var personalConversations: [ConversationSummary] {
        filteredConversations.filter { $0.folder == "Personal" }
    }

func reset() {
        conversations = []
        activeConversationId = nil
        messages = []
        saveLocalCache()
    }

    /// Clear the active chat transcript (CLI `/clear` equivalent).
    /// Keeps the conversation list; wipes in-memory messages and agent run state.
    func clearActiveSession() {
        messages = []
        errorMessage = nil
        AgentRunStore.shared.reset()
    }

    /// Start fresh: clear transcript + create a new conversation.
    func clearSessionAndStartNew() async {
        clearActiveSession()
        activeConversationId = nil
        await createConversation(mode: mode.rawValue)
    }

    func refreshList() async {
        do {
            let remote = try await SupercodeAPIClient.shared.listConversations()
            if !remote.isEmpty {
                // Merge remote over local by id
                var map = Dictionary(uniqueKeysWithValues: conversations.map { ($0.id, $0) })
                for item in remote { map[item.id] = item }
                conversations = map.values.sorted { ($0.updatedAt ?? .distantPast) > ($1.updatedAt ?? .distantPast) }
                saveLocalCache()
            }
        } catch {
            // Keep local cache
        }
    }

    func createConversation(mode: String = "agent") async {
        isLoading = true
        defer { isLoading = false }
        do {
            let created = try await SupercodeAPIClient.shared.createConversation(mode: mode)
            var summary = created
            if summary.folder == nil { summary.folder = "Work" }
            conversations.insert(summary, at: 0)
            activeConversationId = summary.id
            messages = []
            self.mode = AgentMode(rawValue: mode) ?? .agent
            saveLocalCache()
        } catch {
            // Offline / unauthenticated local stub so UI remains usable while wiring auth.
            let local = ConversationSummary(
                id: UUID().uuidString,
                title: "New agent",
                mode: mode,
                updatedAt: Date(),
                folder: "Work"
            )
            conversations.insert(local, at: 0)
            activeConversationId = local.id
            messages = []
            self.mode = AgentMode(rawValue: mode) ?? .agent
            errorMessage = error.localizedDescription
            saveLocalCache()
        }
    }

    func selectConversation(id: String) async {
        activeConversationId = id
        isLoading = true
        defer { isLoading = false }
        if let existing = conversations.first(where: { $0.id == id }),
           let mode = AgentMode(rawValue: existing.mode) {
            self.mode = mode
        }
        do {
            messages = try await SupercodeAPIClient.shared.getMessages(conversationId: id)
        } catch {
            messages = messages // keep whatever is in memory
            errorMessage = error.localizedDescription
        }
    }

    func setMode(_ mode: AgentMode) async {
        self.mode = mode
        guard let id = activeConversationId else { return }
        if let idx = conversations.firstIndex(where: { $0.id == id }) {
            conversations[idx].mode = mode.rawValue
            saveLocalCache()
        }
        try? await SupercodeAPIClient.shared.updateMode(conversationId: id, mode: mode.rawValue)
    }

    func appendLocal(_ message: ChatMessage) {
        messages.append(message)
    }

    func updateAssistant(id: String, mutate: (inout ChatMessage) -> Void) {
        guard let idx = messages.firstIndex(where: { $0.id == id }) else { return }
        mutate(&messages[idx])
    }

    func renameActive(title: String) async {
        guard let id = activeConversationId else { return }
        if let idx = conversations.firstIndex(where: { $0.id == id }) {
            conversations[idx].title = title
            conversations[idx].updatedAt = Date()
            saveLocalCache()
        }
        try? await SupercodeAPIClient.shared.updateTitle(conversationId: id, title: title)
    }

    private func loadLocalCache() {
        guard let data = UserDefaults.standard.data(forKey: localCacheKey),
              let rows = try? JSONDecoder().decode([ConversationSummary].self, from: data)
        else { return }
        conversations = rows
    }

    private func saveLocalCache() {
        if let data = try? JSONEncoder().encode(conversations) {
            UserDefaults.standard.set(data, forKey: localCacheKey)
        }
    }
}

@MainActor
final class AgentRunStore: ObservableObject {
    static let shared = AgentRunStore()

    @Published var status: AgentStatus = .idle
    @Published var diffs: [DiffFile] = []
    @Published var selectedDiffId: String?
    @Published var lastError: String?
    @Published var isInspectorVisible: Bool = true
    @Published var agentTodos: [AgentTodoItem] = []
    @Published var stepCount: Int = 0

    private var runTask: Task<Void, Never>?

    func reset() {
        runTask?.cancel()
        status = .idle
        diffs = []
        selectedDiffId = nil
        lastError = nil
        agentTodos = []
        stepCount = 0
        PermissionManager.shared.resolve(.deny)
    }

    func stop() {
        runTask?.cancel()
        runTask = nil
        if status != .idle {
            status = .idle
        }
        PermissionManager.shared.resolve(.deny)
    }

    func send(prompt: String) {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        runTask?.cancel()
        lastError = nil
        stepCount = 0

        runTask = Task {
            let conversations = ConversationStore.shared
            let session = AppSessionStore.shared
            let workspace = WorkspaceStore.shared
            let mode = conversations.mode

            if conversations.activeConversationId == nil {
                await conversations.createConversation(mode: mode.rawValue)
            }
            guard let conversationId = conversations.activeConversationId else { return }

            let userMessage = ChatMessage(role: .user, content: trimmed)
            conversations.appendLocal(userMessage)

            if conversations.messages.filter({ $0.role == .user }).count == 1 {
                let title = String(trimmed.prefix(48))
                await conversations.renameActive(title: title)
            }

            try? await SupercodeAPIClient.shared.addMessage(
                conversationId: conversationId,
                role: "user",
                content: trimmed
            )

            let assistantId = UUID().uuidString
            conversations.appendLocal(
                ChatMessage(id: assistantId, role: .assistant, content: "", parts: [])
            )

            status = .thinking

            // Working transcript for multi-turn tool loop (OpenAI-style roles).
            var apiMessages: [[String: Any]] = []
            let system = ToolCatalog.systemPrompt(
                mode: mode,
                workspacePath: workspace.path,
                gitBranch: workspace.gitBranch,
                effort: session.selectedEffort
            )
            apiMessages.append(["role": "system", "content": system])

            for msg in conversations.messages {
                if msg.id == assistantId { continue }
                guard msg.role == .user || msg.role == .assistant || msg.role == .system else { continue }
                let content = msg.content.isEmpty
                    ? msg.parts.compactMap { part -> String? in
                        if case .text(_, let c) = part { return c }
                        return nil
                    }.joined()
                    : msg.content
                if content.isEmpty { continue }
                apiMessages.append(["role": msg.role.rawValue, "content": content])
            }
            // Ensure latest user turn present
            if (apiMessages.last?["content"] as? String) != trimmed {
                apiMessages.append(["role": "user", "content": trimmed])
            }

            let tools = ToolCatalog.tools(for: mode)
            var collectedText = ""

            do {
                for step in 0..<ToolCatalog.maxAgentSteps {
                    try Task.checkCancellation()
                    stepCount = step + 1
                    status = .thinking

                    var stepText = ""
                    var toolCalls: [(id: String, name: String, args: [String: Any])] = []
                    var sawError: String?

                    try await SupercodeAPIClient.shared.streamChat(
                        messages: apiMessages,
                        provider: session.selectedProvider,
                        model: session.selectedModel,
                        tools: tools.isEmpty ? nil : tools
                    ) { event in
                        await MainActor.run {
                            switch event {
                            case .text(let chunk):
                                self.status = .streaming
                                stepText += chunk
                                collectedText += chunk
                                conversations.updateAssistant(id: assistantId) { msg in
                                    msg.content += chunk
                                    if let idx = msg.parts.lastIndex(where: {
                                        if case .text = $0 { return true }
                                        return false
                                    }), case .text(let id, let existing) = msg.parts[idx] {
                                        msg.parts[idx] = .text(id: id, content: existing + chunk)
                                    } else {
                                        msg.parts.append(.text(id: UUID().uuidString, content: chunk))
                                    }
                                }
                            case .reasoning(let chunk):
                                self.status = .thinking
                                conversations.updateAssistant(id: assistantId) { msg in
                                    if let idx = msg.parts.lastIndex(where: {
                                        if case .reasoning = $0 { return true }
                                        return false
                                    }), case .reasoning(let id, let existing) = msg.parts[idx] {
                                        msg.parts[idx] = .reasoning(id: id, content: existing + chunk)
                                    } else {
                                        msg.parts.append(.reasoning(id: UUID().uuidString, content: chunk))
                                    }
                                }
                            case .toolCall(let id, let name, let args):
                                self.status = .tool
                                let plainArgs = Dictionary(uniqueKeysWithValues: args.map { ($0.key, $0.value.value as Any) })
                                toolCalls.append((id: id, name: name, args: plainArgs))
                                let part = ToolCallPart(
                                    id: id,
                                    toolName: name,
                                    args: args,
                                    status: .running,
                                    resultPreview: nil,
                                    durationMs: nil,
                                    isExpanded: false
                                )
                                conversations.updateAssistant(id: assistantId) { msg in
                                    msg.parts.append(.toolCall(part))
                                }
                            case .finish:
                                break
                            case .error(let message):
                                sawError = message
                                self.lastError = message
                                self.status = .error
                            }
                        }
                    }

                    if let sawError {
                        throw APIError.server(sawError)
                    }

                    let recentTools: [ToolCallPart] = toolCalls.map { call in
                        ToolCallPart(
                            id: call.id,
                            toolName: call.name,
                            args: call.args.mapValues { AnyCodable($0) },
                            status: .running,
                            resultPreview: nil,
                            durationMs: nil,
                            isExpanded: false
                        )
                    }

                    if recentTools.isEmpty {
                        // Final assistant turn — no more tools
                        status = .idle
                        break
                    }

                    // Append assistant tool_calls message for next turn context
                    var assistantToolCalls: [[String: Any]] = []
                    var toolResultMessages: [[String: Any]] = []

                    for part in recentTools {
                        try Task.checkCancellation()
                        status = .tool
                        if part.toolName == "write_file" || part.toolName == "edit_file" || part.toolName == "run_command" {
                            status = .needsPermission
                        }

                        let plainArgs = part.args.mapValues { $0.value as Any }
                        let started = Date()

                        let result = await LocalToolRuntime.execute(
                            name: part.toolName,
                            args: plainArgs,
                            workspaceRoot: workspace.path,
                            mode: mode
                        )
                        let duration = Int(Date().timeIntervalSince(started) * 1000)

                        conversations.updateAssistant(id: assistantId) { msg in
                            if let idx = msg.parts.firstIndex(where: {
                                if case .toolCall(let p) = $0 { return p.id == part.id }
                                return false
                            }), case .toolCall(var p) = msg.parts[idx] {
                                p.status = result.success ? .completed : .failed
                                p.resultPreview = result.preview ?? String(result.json.prefix(240))
                                p.durationMs = duration
                                msg.parts[idx] = .toolCall(p)
                            }
                        }

                        if let rel = result.mutatedRelativePath, let abs = result.mutatedAbsolutePath {
                            recordDiff(
                                path: rel,
                                absolutePath: abs,
                                previous: result.previousContent,
                                newContent: result.newContent
                            )
                            workspace.reloadTree()
                        }

                        if part.toolName == "todowrite" {
                            updateTodos(from: result.json)
                        }
                        if part.toolName == "switch_to_agent_mode", result.success {
                            await conversations.setMode(.agent)
                        }
                        if part.toolName == "question" {
                            // Stop loop so user can answer
                            status = .idle
                            // Still feed tool result
                        }

                        let fnCall: [String: Any] = [
                            "id": part.id,
                            "type": "function",
                            "function": [
                                "name": part.toolName,
                                "arguments": stringifyArgs(plainArgs),
                            ] as [String: Any],
                        ]
                        assistantToolCalls.append(fnCall)
                        toolResultMessages.append([
                            "role": "tool",
                            "tool_call_id": part.id,
                            "name": part.toolName,
                            "content": result.json,
                        ])
                    }

                    // Push assistant message with tool_calls + tool results
                    var assistantMsg: [String: Any] = [
                        "role": "assistant",
                        "content": stepText.isEmpty ? NSNull() : stepText,
                        "tool_calls": assistantToolCalls,
                    ]
                    if stepText.isEmpty {
                        assistantMsg["content"] = ""
                    }
                    apiMessages.append(assistantMsg)
                    apiMessages.append(contentsOf: toolResultMessages)

                    // If a question tool ran, stop for user input
                    if recentTools.contains(where: { $0.toolName == "question" }) {
                        status = .idle
                        break
                    }
                }

                if status != .error {
                    status = .idle
                }

                let finalText = conversations.messages.first(where: { $0.id == assistantId })?.content ?? collectedText
                if !finalText.isEmpty {
                    try? await SupercodeAPIClient.shared.addMessage(
                        conversationId: conversationId,
                        role: "assistant",
                        content: finalText
                    )
                }
            } catch is CancellationError {
                status = .idle
            } catch {
                status = .error
                lastError = error.localizedDescription
                conversations.updateAssistant(id: assistantId) { msg in
                    if msg.content.isEmpty {
                        msg.content = "Error: \(error.localizedDescription)"
                        msg.parts = [.text(id: UUID().uuidString, content: msg.content)]
                    }
                }
            }
        }
    }

    private func stringifyArgs(_ args: [String: Any]) -> String {
        guard JSONSerialization.isValidJSONObject(args),
              let data = try? JSONSerialization.data(withJSONObject: args),
              let s = String(data: data, encoding: .utf8)
        else { return "{}" }
        return s
    }

    private func updateTodos(from json: String) {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rows = obj["todos"] as? [[String: Any]]
        else { return }
        agentTodos = rows.compactMap { row in
            let title = row["title"] as? String ?? ""
            guard !title.isEmpty else { return nil }
            return AgentTodoItem(
                id: (row["id"] as? String) ?? UUID().uuidString,
                title: title,
                status: (row["status"] as? String) ?? "pending"
            )
        }
    }

    private func recordDiff(path: String, absolutePath: String, previous: String?, newContent: String?) {
        let oldLines = (previous ?? "").components(separatedBy: "\n")
        let newLines = (newContent ?? "").components(separatedBy: "\n")
        var built: [DiffLine] = []
        // Simple line-oriented preview (not a full LCS)
        let oldSet = Set(oldLines)
        let newSet = Set(newLines)
        for line in oldLines.prefix(200) where !newSet.contains(line) {
            built.append(DiffLine(id: UUID().uuidString, kind: .remove, text: line, oldNumber: nil, newNumber: nil))
        }
        for line in newLines.prefix(200) where !oldSet.contains(line) {
            built.append(DiffLine(id: UUID().uuidString, kind: .add, text: line, oldNumber: nil, newNumber: nil))
        }
        if built.isEmpty, let newContent {
            built = newContent.components(separatedBy: "\n").prefix(80).map {
                DiffLine(id: UUID().uuidString, kind: .add, text: $0, oldNumber: nil, newNumber: nil)
            }
        }
        let file = DiffFile(
            id: absolutePath,
            path: path,
            absolutePath: absolutePath,
            languageHint: URL(fileURLWithPath: path).pathExtension,
            hunks: [DiffHunk(id: UUID().uuidString, header: "@@ change @@", lines: built)],
            isAccepted: true, // already applied on disk; Accept is confirmation, Reject reverts
            previousContent: previous,
            newContent: newContent,
            wasCreated: previous == nil
        )
        if let idx = diffs.firstIndex(where: { $0.absolutePath == absolutePath || $0.path == path }) {
            diffs[idx] = file
        } else {
            diffs.insert(file, at: 0)
        }
        selectedDiffId = file.id
        isInspectorVisible = true
        WorkspaceStore.shared.fileBrowserTab = .changes
    }

    /// Keep applied change (already on disk).
    func acceptDiff(_ id: String) {
        guard let idx = diffs.firstIndex(where: { $0.id == id }) else { return }
        diffs[idx].isAccepted = true
    }

    /// Revert applied change using previous snapshot.
    func rejectDiff(_ id: String) {
        guard let idx = diffs.firstIndex(where: { $0.id == id }) else { return }
        let file = diffs[idx]
        if let abs = file.absolutePath {
            if file.wasCreated {
                try? FileManager.default.removeItem(atPath: abs)
            } else if let previous = file.previousContent {
                try? previous.write(to: URL(fileURLWithPath: abs), atomically: true, encoding: .utf8)
            }
        }
        diffs[idx].isAccepted = false
        WorkspaceStore.shared.reloadTree()
    }

    func acceptAllDiffs() {
        for d in diffs { acceptDiff(d.id) }
    }

    func rejectAllDiffs() {
        for d in diffs.reversed() { rejectDiff(d.id) }
    }
}
