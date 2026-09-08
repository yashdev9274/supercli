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
        // Debug → local API; Release → production. Custom overrides still win.
        let stored = UserDefaults.standard.string(forKey: "serverURL")
            ?? UserDefaults.standard.string(forKey: "ai.supercode.desktop.serverURL")
            ?? KeychainStore.get(.serverURL)
        let resolvedServer = ServerConfig.resolvedURL(stored: stored)
        serverURL = resolvedServer

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

        // Persist migration after all stored properties are initialized.
        if stored.map(ServerConfig.normalize) != ServerConfig.normalize(resolvedServer) {
            UserDefaults.standard.set(resolvedServer, forKey: "serverURL")
            KeychainStore.set(resolvedServer, for: .serverURL)
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
        AgentRunStore.shared.stop()
        let trimmed = ServerConfig.normalize(url)
        serverURL = trimmed.isEmpty ? ServerConfig.defaultURL : trimmed
        KeychainStore.set(serverURL, for: .serverURL)
        UserDefaults.standard.set(serverURL, forKey: "serverURL")
    }

    func useLocalServer() {
        updateServerURL(ServerConfig.localURL)
    }

    func useProductionServer() {
        updateServerURL(ServerConfig.productionURL)
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
        AgentRunStore.shared.stop()
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
    /// Main center column: chat transcript vs file editor.
    @Published var mainPane: MainPaneMode = .chat
    @Published var openFiles: [OpenEditorFile] = []
    @Published var activeFileId: String?

    enum MainPaneMode: String, Equatable {
        case chat
        case file
    }

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
        if path != nil { AgentRunStore.shared.stop() }
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
        AgentRunStore.shared.stop()
        path = nil
        displayName = "No workspace"
        gitBranch = nil
        rootNodes = []
        expandedPaths = []
        selectedPath = nil
        treeError = nil
        openFiles = []
        activeFileId = nil
        mainPane = .chat
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
            openFile(at: node.path)
            return
        }
        if expandedPaths.contains(node.path) {
            expandedPaths.remove(node.path)
        } else {
            expandedPaths.insert(node.path)
            ensureChildrenLoaded(for: node)
        }
    }

    /// Open a workspace file in the main editor pane (desk-style).
    func openFile(at path: String) {
        selectedPath = path
        if let existing = openFiles.first(where: { $0.path == path }) {
            activeFileId = existing.id
            mainPane = .file
            return
        }

        let maxBytes = 1_500_000
        let url = URL(fileURLWithPath: path)
        var file = OpenEditorFile(path: path)

        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: path)
            let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
            if size > maxBytes {
                file.error = "File is too large to preview (\(size / 1024) KB)."
            } else if let data = try? Data(contentsOf: url) {
                if looksBinary(data) {
                    file.isBinary = true
                } else if let text = String(data: data, encoding: .utf8)
                    ?? String(data: data, encoding: .isoLatin1) {
                    file.content = text
                } else {
                    file.isBinary = true
                }
            } else {
                file.error = "Could not read file."
            }
        } catch {
            file.error = error.localizedDescription
        }

        openFiles.append(file)
        activeFileId = file.id
        mainPane = .file
    }

    func closeFile(_ id: String) {
        openFiles.removeAll { $0.id == id }
        if activeFileId == id {
            activeFileId = openFiles.last?.id
        }
        if openFiles.isEmpty {
            mainPane = .chat
            selectedPath = nil
        }
    }

    func showChatPane() {
        mainPane = .chat
    }

    /// Shallow file names for @mention picker.
    func flatFileNames(limit: Int = 40) -> [String] {
        var names: [String] = []
        func walk(_ nodes: [WorkspaceNode]) {
            for node in nodes {
                if names.count >= limit { return }
                if node.isDirectory {
                    if let kids = node.children { walk(kids) }
                } else {
                    names.append(node.name)
                }
            }
        }
        walk(rootNodes)
        return names
    }

    private func looksBinary(_ data: Data) -> Bool {
        if data.isEmpty { return false }
        let sample = data.prefix(512)
        if sample.contains(0) { return true }
        // High ratio of non-printable → treat as binary
        let nonPrintable = sample.filter { byte in
            byte < 9 || (byte > 13 && byte < 32)
        }.count
        return Double(nonPrintable) / Double(sample.count) > 0.3
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
        AgentRunStore.shared.stop()
        messages = []
        persistTranscript()
        errorMessage = nil
        AgentRunStore.shared.reset()
        AgentRunStore.shared.dismissAlert()
    }

    /// Start fresh: clear transcript + create a new conversation.
    func clearSessionAndStartNew() async {
        clearActiveSession()
        activeConversationId = nil
        WorkspaceStore.shared.showChatPane()
        await createConversation(mode: mode.rawValue)
    }

    /// Drop the last user message (and trailing assistant reply) so the user can edit & resend.
    func beginEditLastUserMessage() -> String? {
        guard let idx = messages.lastIndex(where: { $0.role == .user }) else { return nil }
        let content = messages[idx].content
        // Remove that user turn and anything after it (assistant / tools).
        messages.removeSubrange(idx...)
        persistTranscript()
        AgentRunStore.shared.stop()
        AgentRunStore.shared.lastError = nil
        AgentRunStore.shared.dismissAlert()
        return content
    }

    func removeMessage(id: String) {
        messages.removeAll { $0.id == id }
        persistTranscript()
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
        persistTranscript()
        let previousID = activeConversationId
        isLoading = true
        defer { isLoading = false }
        do {
            let created = try await SupercodeAPIClient.shared.createConversation(mode: mode)
            guard !Task.isCancelled, activeConversationId == previousID else { return }
            var summary = created
            if summary.folder == nil { summary.folder = "Work" }
            conversations.insert(summary, at: 0)
            activeConversationId = summary.id
            messages = []
            self.mode = AgentMode.compatible(mode)
            saveLocalCache()
        } catch {
            guard !Task.isCancelled, activeConversationId == previousID else { return }
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
            self.mode = AgentMode.compatible(mode)
            errorMessage = error.localizedDescription
            saveLocalCache()
        }
    }

    func selectConversation(id: String) async {
        AgentRunStore.shared.stop()
        persistTranscript()
        activeConversationId = id
        messages = []
        errorMessage = nil
        isLoading = true
        defer { if activeConversationId == id { isLoading = false } }
        if let existing = conversations.first(where: { $0.id == id }) { mode = AgentMode.compatible(existing.mode) }
        if let url = transcriptURL(id), let data = try? Data(contentsOf: url),
           let cached = try? JSONDecoder().decode([ChatMessage].self, from: data) {
            messages = cached
            return
        }
        do {
            let loaded = try await SupercodeAPIClient.shared.getMessages(conversationId: id)
            guard activeConversationId == id else { return }
            messages = loaded
        } catch {
            guard activeConversationId == id else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func transcriptURL(_ id: String) -> URL? {
        let filename = NativeFileTools.version(id)
        let scope = NativeFileTools.version((UserDefaults.standard.string(forKey: "serverURL") ?? "default") + "|" + (AppSessionStore.shared.user?.id ?? "local"))
        guard let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        return directory.appendingPathComponent("Supercode/transcripts/\(scope)/\(filename).json")
    }

    func persistTranscript() {
        guard let id = activeConversationId, let url = transcriptURL(id), let data = try? JSONEncoder().encode(messages) else { return }
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            try data.write(to: url, options: [.atomic])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        } catch { errorMessage = "Could not save local transcript: \(error.localizedDescription)" }
    }

    func setMode(_ mode: AgentMode) async {
        AgentRunStore.shared.stop()
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
    @Published var activeAlert: AgentAlertKind?
    @Published var isInspectorVisible: Bool = true
    @Published var agentTodos: [AgentTodoItem] = []
    @Published var stepCount: Int = 0

    private var runTask: Task<Void, Never>?
    private var runID: UUID?
    private var activeAssistantID: String?

    func reset() {
        stop()
        status = .idle
        diffs = []
        selectedDiffId = nil
        lastError = nil
        activeAlert = nil
        agentTodos = []
        stepCount = 0
        PermissionManager.shared.resolve(.deny)
    }

    func dismissAlert() {
        activeAlert = nil
    }

    func presentError(_ message: String) {
        lastError = message
        activeAlert = Self.alert(from: message)
    }

    private static func alert(from message: String) -> AgentAlertKind {
        let lower = message.lowercased()
if lower.contains("plan_limit")
            || lower.contains("plan limit")
            || lower.contains("subscription")
            || lower.contains("no active subscription")
            || (lower.contains("upgrade") && lower.contains("credit")) {
            return .planLimit(message: message)
        }
        if lower.contains("credit") || lower.contains("quota") || lower.contains("billing") {
            return .planLimit(message: message)
        }
        return .streamError(message: message)
    }

    func stop() {
        runID = nil
        runTask?.cancel()
        if let id = activeAssistantID { finishPending(assistantID: id, cancelled: true) }
        activeAssistantID = nil
        ConversationStore.shared.persistTranscript()
        runTask = nil
        if status != .idle {
            status = .idle
        }
        PermissionManager.shared.resolve(.deny)
    }

    func send(prompt: String) {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        stop()
        let token = UUID()
        runID = token
        lastError = nil
        activeAlert = nil
        stepCount = 0
        status = .thinking
        let conversations = ConversationStore.shared
        let workspace = WorkspaceStore.shared
        let session = AppSessionStore.shared
        let context = NativeTurnEngine.Context(root: workspace.path, mode: conversations.mode, provider: session.selectedProvider, model: session.selectedModel)
        let system = ToolCatalog.systemPrompt(mode: context.mode, workspacePath: context.root, gitBranch: workspace.gitBranch, effort: session.selectedEffort)
        workspace.showChatPane()
        runTask = Task {
            if conversations.activeConversationId == nil { await conversations.createConversation(mode: context.mode.rawValue) }
            guard runID == token, !Task.isCancelled, let conversationID = conversations.activeConversationId else { return }
            let assistantID = UUID().uuidString
            activeAssistantID = assistantID
            conversations.appendLocal(ChatMessage(role: .user, content: trimmed))
            var history: [[String: Any]] = [["role": "system", "content": system]]
            history += conversations.messages.flatMap { message -> [[String: Any]] in
                if let canonical = message.canonicalHistory { return canonical.map { $0.mapValues(\.value) } }
                return message.content.isEmpty ? [] : [["role": message.role.rawValue, "content": message.content]]
            }
            conversations.appendLocal(ChatMessage(id: assistantID, role: .assistant, content: ""))
            let activity: NativeTurnEngine.Activity = { part in
                guard self.runID == token, conversations.activeConversationId == conversationID, !Task.isCancelled else { return }
                switch part {
                case .toolCall: self.status = .tool
                case .text: self.status = .streaming
                case .reasoning: self.status = .thinking
                }
                conversations.updateAssistant(id: assistantID) { $0.apply(part) }
            }
            do {
                try Task.checkCancellation()
                let references = try await NativeFileReferences.resolve(prompt: trimmed, context: context, activity: activity)
                history += references
                let outcome = try await NativeTurnEngine.run(history: history, context: context, activity: activity) { result, name in
                    guard self.runID == token, conversations.activeConversationId == conversationID else { return }
                    if name == "todowrite" { self.updateTodos(from: result.json) }
                    if let rel = result.mutatedRelativePath, let abs = result.mutatedAbsolutePath {
                        self.recordDiff(path: rel, absolutePath: abs, previous: result.previousContent, newContent: result.newContent)
                        workspace.reloadTree()
                    }
                }
                guard runID == token, !Task.isCancelled else { return }
                conversations.updateAssistant(id: assistantID) { message in
                    message.canonicalHistory = (references + outcome.history).map { $0.mapValues(AnyCodable.init) }
                }
                conversations.persistTranscript()
                status = .idle
                activeAssistantID = nil
                try? await SupercodeAPIClient.shared.addMessage(conversationId: conversationID, role: "user", content: trimmed)
                let finalText = conversations.messages.first { $0.id == assistantID }?.content ?? outcome.text
                try? await SupercodeAPIClient.shared.addMessage(conversationId: conversationID, role: "assistant", content: finalText)
                guard runID == token else { return }
                if conversations.messages.filter({ $0.role == .user }).count == 1 { await conversations.renameActive(title: String(trimmed.prefix(48))) }
            } catch {
                guard runID == token else { return }
                finishPending(assistantID: assistantID, cancelled: Task.isCancelled || error is CancellationError)
                if Task.isCancelled || error is CancellationError { status = .idle }
                else {
                    status = .error
                    presentError(error.localizedDescription)
                    conversations.updateAssistant(id: assistantID) { $0.apply(.text(id: UUID().uuidString, content: "Error: \(error.localizedDescription)")) }
                }
                conversations.persistTranscript()
            }
        }
    }

    private func finishPending(assistantID: String, cancelled: Bool) {
        ConversationStore.shared.updateAssistant(id: assistantID) { message in
            message.parts = message.parts.map { part in
                guard case .toolCall(var tool) = part, tool.status == .queued || tool.status == .running else { return part }
                tool.status = cancelled ? .cancelled : .failed
                tool.resultPreview = cancelled ? "Cancelled" : "Stream interrupted"
                return .toolCall(tool)
            }
            // Preserve completed operations even if the round was interrupted; never leave orphan tool calls.
            if message.canonicalHistory == nil {
                message.canonicalHistory = message.parts.compactMap { part -> [[String: AnyCodable]]? in
                    guard case .toolCall(let tool) = part else { return nil }
                    let result = tool.resultJSON ?? LocalToolRuntime.failJSON(cancelled: cancelled, reason: tool.resultPreview ?? "Interrupted").json
                    return [
                        ["role": AnyCodable("assistant"), "content": AnyCodable(""), "tool_calls": AnyCodable([["id": tool.id, "type": "function", "function": ["name": tool.toolName, "arguments": NativeTurnEngine.json(tool.args.mapValues(\.value))]]])],
                        ["role": AnyCodable("tool"), "tool_call_id": AnyCodable(tool.id), "content": AnyCodable(result)],
                    ]
                }.flatMap { $0 }
                message.canonicalHistory?.append(["role": AnyCodable("assistant"), "content": AnyCodable(message.content + (cancelled ? "\nRun cancelled." : "\nRun interrupted."))])
            }
        }
    }

    private func updateTodos(from json: String) {
        guard let object = try? JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any],
              let data = object["data"] as? [String: Any], let rows = data["todos"] as? [[String: Any]] else { return }
        agentTodos = rows.enumerated().compactMap { index, row in
            guard let content = row["content"] as? String else { return nil }
            return AgentTodoItem(id: String(index), title: content, status: row["status"] as? String ?? "pending")
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
            guard let root = WorkspaceStore.shared.path,
                  let url = try? NativeFileTools.resolve(abs, root: root),
                  let current = try? NativeFileTools.load(url), current == file.newContent else {
                presentError("Cannot revert: file changed since the agent edit. Review it manually.")
                return
            }
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
