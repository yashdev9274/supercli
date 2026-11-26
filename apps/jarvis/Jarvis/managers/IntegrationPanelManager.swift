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
import SwiftUI
import Combine

/// Drives the Integration panel inside the Dynamic Island.
///
/// When a voice chat call executes tools (e.g. "check my email"), the server
/// returns tool metadata and `present(toolCalls:)` switches the notch to the
/// integration tab, shows the app being called plus what the agent did, and
/// exposes the toolkit's actions for the user to run client-side via Composio.
@MainActor
final class IntegrationPanelManager: ObservableObject {
    static let shared = IntegrationPanelManager()

    // MARK: Published state

    @Published private(set) var activeApp: ActiveApp?
    @Published private(set) var activity: Activity = .idle
    @Published private(set) var toolCalls: [VoiceToolCall] = []
    @Published private(set) var composePanel: AppActionPanel?
    @Published private(set) var actions: [ComposioToolAction] = []
    @Published private(set) var isLoadingActions = false
    @Published private(set) var isExecutingAction = false
    @Published private(set) var actionResult: String?
    @Published private(set) var actionError: String?
    @Published private(set) var pendingAction: ComposioToolAction?

    // MARK: Dependencies

    private let composio = ComposioManager.shared
    private let coordinator = JarvisCoordinator.shared

    // MARK: Types

    enum Activity: Equatable {
        case idle
        case working(String)
        case success(String)
        case failure(String)
    }

    struct ActiveApp: Equatable {
        let toolkitSlug: String
        let appName: String
        let symbol: String
        let summary: String?
    }

    // MARK: Presenting

    /// Presents the integration panel for the tools executed during a voice
    /// chat, switching the notch tab so the panel is revealed when the voice
    /// overlay disappears.
    func present(toolCalls calls: [VoiceToolCall]) {
        guard let first = calls.first else { return }
        toolCalls = calls
        composePanel = AppActionPanel.make(from: calls)

        let toolkitSlug = first.toolkit ?? catalogSlug(forApp: first.app)
        if let toolkitSlug, !toolkitSlug.isEmpty {
            let info = Self.appInfo(forToolkit: toolkitSlug, appName: first.app)
            presentApp(toolkitSlug: toolkitSlug, appName: info.name, symbol: info.symbol, summary: first.summary)
        } else {
            let info = Self.appInfo(forToolkit: "", appName: first.app)
            presentApp(toolkitSlug: "", appName: info.name, symbol: info.symbol, summary: first.summary)
        }
    }

    /// Switches the notch to the integration tab and shows a specific app.
    /// Used by the voice flow and by the connected-apps list fallback.
    func presentApp(toolkitSlug: String, appName: String, symbol: String, summary: String? = nil) {
        activeApp = ActiveApp(toolkitSlug: toolkitSlug, appName: appName, symbol: symbol, summary: summary)
        composePanel = nil
        actionResult = nil
        actionError = nil
        pendingAction = nil
        if let summary, !summary.isEmpty {
            activity = .success(summary)
        } else {
            activity = .idle
        }
        withAnimation(.smooth(duration: 0.3)) {
            coordinator.currentView = .integration
        }
        loadActionsIfNeeded()
    }

    /// Returns the panel to the connected-apps list.
    func clear() {
        activeApp = nil
        activity = .idle
        toolCalls = []
        composePanel = nil
        actions = []
        actionResult = nil
        actionError = nil
        pendingAction = nil
        isExecutingAction = false
        isLoadingActions = false
    }

    // MARK: Actions

    /// Fetches the toolkit's runnable actions on first presentation.
    func loadActionsIfNeeded() {
        guard let activeApp, actions.isEmpty, !isLoadingActions, composio.isConfigured else { return }
        isLoadingActions = true
        Task { [weak self] in
            guard let self else { return }
            defer { self.isLoadingActions = false }
            do {
                let fetched = try await self.composio.fetchToolkitActions(activeApp.toolkitSlug)
                self.actions = fetched.filter { !($0.isDeprecated ?? false) && !($0.isDisabled ?? false) }
            } catch {
                self.actionError = error.localizedDescription
            }
        }
    }

    /// Runs an action against the user's connected account and publishes the
    /// result for inline display in the panel.
    func run(_ action: ComposioToolAction, arguments: [String: ComposioJSONValue]) async {
        pendingAction = action
        await execute(slug: action.slug, displayName: action.displayName, arguments: arguments)
    }

    /// Runs a tool by slug (used by the per-app compose panel, where the user
    /// edits the arguments before re-running the agent's action).
    func runTool(_ slug: String, arguments: [String: ComposioJSONValue]) async {
        await execute(slug: slug, displayName: slug, arguments: arguments)
    }

    private func execute(slug: String, displayName: String, arguments: [String: ComposioJSONValue]) async {
        guard !isExecutingAction else { return }
        isExecutingAction = true
        actionResult = nil
        actionError = nil
        activity = .working("Running \(displayName)…")
        defer {
            isExecutingAction = false
            pendingAction = nil
        }
        do {
            let account = composio.connectedAccount(for: activeApp?.toolkitSlug ?? "")
            let response = try await composio.executeAction(
                slug,
                connectedAccountID: account?.id,
                arguments: arguments
            )
            if response.successful ?? true, let data = response.data {
                actionResult = data.displayString
                activity = .success("\(displayName) completed")
            } else if let error = response.error {
                actionError = error.displayString
                activity = .failure("\(displayName) failed")
            } else {
                actionResult = "Done"
                activity = .success("\(displayName) completed")
            }
        } catch {
            actionError = error.localizedDescription
            activity = .failure("\(displayName) failed")
        }
    }

    // MARK: App catalog

    /// Maps a Composio toolkit slug (or app name) to a display name + SF Symbol.
    static func appInfo(forToolkit toolkitSlug: String, appName: String?) -> (name: String, symbol: String) {
        if let entry = appCatalog[toolkitSlug] {
            return entry
        }
        if let appName, !appName.isEmpty {
            let key = appName.lowercased().replacingOccurrences(of: " ", with: "")
            if let entry = appCatalog[key] {
                return entry
            }
            return (appName, "app.badge.checkmark")
        }
        return (toolkitSlug.isEmpty ? "Integrations" : toolkitSlug.capitalized, "square.grid.2x2.fill")
    }

    /// Fallback: derive a catalog slug from a free-form app name.
    private func catalogSlug(forApp appName: String?) -> String? {
        guard let appName else { return nil }
        return Self.appCatalog.first { $0.value.name.lowercased() == appName.lowercased() }?.key
    }

    private static let appCatalog: [String: (name: String, symbol: String)] = [
        "gmail": ("Gmail", "envelope.fill"),
        "github": ("GitHub", "chevron.left.forwardslash.chevron.right"),
        "linear": ("Linear", "chart.line.uptrend.xyaxis"),
        "slack": ("Slack", "bubble.left.and.bubble.right.fill"),
        "notion": ("Notion", "doc.text.fill"),
        "figma": ("Figma", "paintbrush.fill"),
        "discord": ("Discord", "bubble.left.fill"),
        "whatsapp": ("WhatsApp", "phone.fill"),
        "exa": ("Web Search", "globe"),
        "web": ("Web Search", "globe")
    ]
}