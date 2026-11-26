/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import Foundation
import Defaults
#if canImport(Combine)
import Combine
#endif

/// Orchestrates Composio state for the Integrations tab: toolkit catalog,
/// connected accounts, and the OAuth connect/disconnect flows.
@MainActor
final class ComposioManager: ObservableObject {
    static let shared = ComposioManager()

    // MARK: Published state

    @Published private(set) var toolkits: [ComposioToolkit] = []
    @Published private(set) var connectedAccounts: [ComposioConnectedAccount] = []
    @Published private(set) var isLoadingToolkits = false
    @Published private(set) var isConnecting = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var pendingConnectURL: URL?

    // MARK: Dependencies

    private let keychain: any ComposioKeychainStoring
    private let clientFactory: (String) -> any ComposioAPIClienting

    private var client: (any ComposioAPIClienting)?
    private var pollTask: Task<Void, Never>?

    init(
        keychain: any ComposioKeychainStoring = KeychainComposioStore(),
        clientFactory: @escaping (String) -> any ComposioAPIClienting = { ComposioAPIClient(apiKey: $0) }
    ) {
        self.keychain = keychain
        self.clientFactory = clientFactory
    }

    // MARK: Config

    /// The API key in use: a Keychain override if present, otherwise the
    /// compiled-in default so the tab works out of the box.
    var apiKey: String {
        keychain.read(.apiKey) ?? ComposioCredentials.embeddedAPIKey
    }

    var isConfigured: Bool {
        !apiKey.isEmpty
    }

    /// Stable user id for this machine, generated once and stored in Defaults.
    var userID: String {
        if Defaults[.composioUserID].isEmpty {
            Defaults[.composioUserID] = UUID().uuidString
        }
        return Defaults[.composioUserID]
    }

    @discardableResult
    func setAPIKey(_ value: String) -> OSStatus {
        keychain.write(value.trimmingCharacters(in: .whitespacesAndNewlines), account: .apiKey)
    }

    @discardableResult
    func clearAPIKey() -> OSStatus {
        let status = keychain.delete(.apiKey)
        connectedAccounts = []
        errorMessage = nil
        return status
    }

    func reportError(_ message: String) {
        errorMessage = message
    }

    func consumePendingConnectURL() {
        pendingConnectURL = nil
    }

    // MARK: Data loading

    func loadIfNeeded() async {
        guard isConfigured, toolkits.isEmpty else { return }
        await loadData()
    }

    func reload() async {
        await loadData()
    }

    private func loadData() async {
        guard isConfigured else { return }
        errorMessage = nil
        isLoadingToolkits = true
        defer { isLoadingToolkits = false }
        do {
            let resolvedClient = try resolvedClient()
            async let toolkitsResult = resolvedClient.fetchToolkits()
            async let accountsResult = resolvedClient.fetchConnectedAccounts(userID: userID)
            let (fetchedToolkits, fetchedAccounts) = try await (toolkitsResult, accountsResult)
            toolkits = fetchedToolkits
            connectedAccounts = fetchedAccounts
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Connection helpers

    func connectedAccount(for toolkitSlug: String) -> ComposioConnectedAccount? {
        connectedAccounts.first {
            $0.toolkit?.slug == toolkitSlug && ($0.status?.isActive ?? false)
        }
    }

    func isConnected(_ toolkit: ComposioToolkit) -> Bool {
        connectedAccount(for: toolkit.slug) != nil
    }

    // MARK: Connect flow

    /// Resolves the auth config and creates a link session, publishing the
    /// connect URL for the caller to present in an authentication session.
    func beginConnection(for toolkit: ComposioToolkit) async {
        guard isConfigured else {
            errorMessage = ComposioAPIError.missingAPIKey.localizedDescription
            return
        }
        guard !isConnecting else { return }
        isConnecting = true
        errorMessage = nil
        pendingConnectURL = nil
        defer { isConnecting = false }
        do {
            let resolvedClient = try resolvedClient()
            let authConfigs = try await resolvedClient.fetchAuthConfigs(toolkitSlug: toolkit.slug)
            guard let config = authConfigs.first else {
                throw ComposioAPIError.noAuthConfig(toolkit.name)
            }
            let callbackURL = "atoll-composio://oauth-callback"
            let session = try await resolvedClient.createLinkSession(
                authConfigID: config.id,
                userID: userID,
                alias: toolkit.name,
                callbackURL: callbackURL
            )
            guard let url = URL(string: session.redirectURL ?? "https://connect.composio.dev/link/\(session.linkToken)") else {
                throw ComposioAPIError.linkSessionFailed(session.linkToken)
            }
            pendingConnectURL = url
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Polls connected accounts until the expected toolkit flips to ACTIVE
    /// (or a deadline passes), then refreshes the list.
    func pollForConnection(of toolkit: ComposioToolkit, timeout: TimeInterval = 30) async {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }
            let deadline = Date().addingTimeInterval(timeout)
            while !Task.isCancelled {
                do {
                    let resolvedClient = try self.resolvedClient()
                    let accounts = try await resolvedClient.fetchConnectedAccounts(userID: self.userID)
                    self.connectedAccounts = accounts
                    if accounts.contains(where: { $0.toolkit?.slug == toolkit.slug && ($0.status?.isActive ?? false) }) {
                        return
                    }
                } catch {
                    // Transient failures during OAuth completion are expected; keep polling.
                }
                if Date() > deadline { return }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func cancelPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    // MARK: Disconnect

    func disconnect(_ toolkit: ComposioToolkit) async {
        guard let account = connectedAccount(for: toolkit.slug) else { return }
        errorMessage = nil
        do {
            let resolvedClient = try resolvedClient()
            try await resolvedClient.disconnectAccount(id: account.id)
            connectedAccounts.removeAll { $0.id == account.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: Tool actions

    /// Fetches the runnable actions for a toolkit (used by the integration
    /// panel in the Dynamic Island).
    func fetchToolkitActions(_ toolkitSlug: String) async throws -> [ComposioToolAction] {
        let resolvedClient = try resolvedClient()
        return try await resolvedClient.fetchToolkitActions(toolkitSlug: toolkitSlug)
    }

    /// Executes a Composio tool against the caller's connected account.
    func executeAction(_ slug: String, connectedAccountID: String?, arguments: [String: ComposioJSONValue]) async throws -> ComposioToolExecutionResponse {
        let resolvedClient = try resolvedClient()
        return try await resolvedClient.executeAction(
            slug: slug,
            userID: userID,
            connectedAccountID: connectedAccountID,
            arguments: arguments
        )
    }

    // MARK: Private

    private func resolvedClient() throws -> any ComposioAPIClienting {
        guard isConfigured else { throw ComposioAPIError.missingAPIKey }
        if let client {
            return client
        }
        let resolved = clientFactory(apiKey)
        client = resolved
        return resolved
    }
}
