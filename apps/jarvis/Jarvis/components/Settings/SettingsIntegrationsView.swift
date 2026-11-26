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

import SwiftUI
import AuthenticationServices

/// The integration app list shown in the Settings window. Renders ~5 apps
/// at once with the rest reachable by scrolling — the full management UI
/// that previously lived inside the Dynamic Island.
@MainActor
struct SettingsIntegrationsView: View {
    @ObservedObject private var manager = ComposioManager.shared

    @State private var searchText = ""
    @State private var filter: IntegrationFilter = .all
    @State private var draftAPIKey = ""
    @State private var connectingSlug: String?
    @State private var showingKeyPrompt = false

    // Voice provider
    @State private var selectedProvider: VoiceProvider = VoiceConfig.activeProvider
    @State private var smallestAPIKey: String = VoiceConfig.smallestAPIKey
    @State private var sarvamAPIKey: String = VoiceConfig.sarvamAPIKey
    @State private var sarvamTTSSpeaker: String = VoiceConfig.sarvamTTSSpeaker
    @State private var islandLinkCode: String = VoiceConfig.islandLinkCode
    @State private var authToken: String = VoiceConfig.authToken
    @ObservedObject private var novaSignIn = NovaSignIn.shared

    private let authSessionPresenter: (any ComposioAuthSessionPresenting)?

    /// Number of app rows visible before the list scrolls.
    private let visibleRowCount: CGFloat = 5
    private let rowHeight: CGFloat = 82

    init(authSessionPresenter: (any ComposioAuthSessionPresenting)? = nil) {
        self.authSessionPresenter = authSessionPresenter
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            voiceProviderSection

            novaLinkSection

            IntegrationSearchBar(searchText: $searchText, filter: $filter)

            Group {
                if manager.isLoadingToolkits && manager.toolkits.isEmpty {
                    loadingState
                } else if manager.toolkits.isEmpty {
                    errorState
                } else if filteredToolkits.isEmpty {
                    emptySearchState
                } else {
                    integrationList
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .onAppear {
            Task { await manager.loadIfNeeded() }
        }
        .onChange(of: selectedProvider) { _, provider in
            VoiceConfig.configure(activeProvider: provider, smallestAPIKey: smallestAPIKey, sarvamAPIKey: sarvamAPIKey, sarvamTTSSpeaker: sarvamTTSSpeaker)
            VoiceAgentManager.shared.switchProvider(to: provider)
        }
        .onChange(of: manager.pendingConnectURL) { _, url in
            guard let url else { return }
            Task { await presentAuthSession(url: url) }
        }
    }

    // MARK: - Voice Provider

    private var voiceProviderSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Voice Provider")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)

            Picker("STT/TTS Provider", selection: $selectedProvider) {
                Text("Smallest AI").tag(VoiceProvider.smallestAI)
                Text("Sarvam AI").tag(VoiceProvider.sarvam)
            }
            .pickerStyle(.segmented)
            .frame(width: 240)

            switch selectedProvider {
            case .smallestAI:
                HStack {
                    Text("API Key")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    SecureField("sk_...", text: $smallestAPIKey)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                        .onChange(of: smallestAPIKey) { _, key in
                            VoiceConfig.configure(activeProvider: selectedProvider, smallestAPIKey: key, sarvamAPIKey: sarvamAPIKey, sarvamTTSSpeaker: sarvamTTSSpeaker)
                        }
                }

            case .sarvam:
                HStack {
                    Text("API Key")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    SecureField("sk_...", text: $sarvamAPIKey)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                        .onChange(of: sarvamAPIKey) { _, key in
                            VoiceConfig.configure(activeProvider: selectedProvider, smallestAPIKey: smallestAPIKey, sarvamAPIKey: key, sarvamTTSSpeaker: sarvamTTSSpeaker)
                        }
                }
                HStack {
                    Text("TTS Voice")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .frame(width: 60, alignment: .trailing)
                    TextField("shubh", text: $sarvamTTSSpeaker)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                        .onChange(of: sarvamTTSSpeaker) { _, speaker in
                            VoiceConfig.configure(activeProvider: selectedProvider, smallestAPIKey: smallestAPIKey, sarvamAPIKey: sarvamAPIKey, sarvamTTSSpeaker: speaker)
                        }
                }
            }
        }
    }

    // MARK: - Nova link

    /// The code Nova web shows after "Connect island", plus the CLI session
    /// token the voice link requires. Speech stays on Sarvam either way.
    private var novaLinkSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Nova")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)

            HStack {
                Button(action: { novaSignIn.signingIn ? novaSignIn.cancel() : novaSignIn.start() }) {
                    Text(novaSignIn.signingIn ? "Cancel sign-in" : (authToken.isEmpty ? "Sign in to Nova" : "Signed in"))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Capsule().fill(Color.white.opacity(0.16)))
                }
                .buttonStyle(.plain)
                if !novaSignIn.userCode.isEmpty {
                    Text(novaSignIn.userCode)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                }
            }
            if !novaSignIn.status.isEmpty {
                Text(novaSignIn.status)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text("Link code")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .frame(width: 60, alignment: .trailing)
                TextField("From Nova", text: $islandLinkCode)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11))
                    .onChange(of: islandLinkCode) { _, code in
                        VoiceConfig.configure(islandLinkCode: code)
                    }
            }
            HStack {
                Text("Token")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .frame(width: 60, alignment: .trailing)
                SecureField("CLI session token", text: $authToken)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(size: 11))
                    .onChange(of: authToken) { _, token in
                        VoiceConfig.configure(authToken: token)
                    }
            }
        }
    }

    // MARK: States

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
                .controlSize(.small)
            Text("Loading integrations…")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var errorState: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(.orange)

            Text("Couldn't load integrations")
                .font(.system(size: 14, weight: .medium))

            if let message = manager.errorMessage {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            }

            HStack(spacing: 10) {
                Button(action: { Task { await manager.reload() } }) {
                    Text("Retry")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.white.opacity(0.16)))
                }
                .buttonStyle(.plain)

                Button(action: { showingKeyPrompt = true }) {
                    Text("Change API key")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(Color.white.opacity(0.08)))
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .alert("Change API key", isPresented: $showingKeyPrompt) {
            SecureField("Composio API key", text: $draftAPIKey)
            Button("Save", action: saveAPIKey)
            Button("Remove key", role: .destructive) {
                manager.clearAPIKey()
                Task { await manager.reload() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The app ships with a built-in key. Paste your own to override it, or remove to restore the built-in one.")
        }
    }

    private var emptySearchState: some View {
        VStack(spacing: 8) {
            Image(systemName: filter == .active ? "checkmark.circle" : "magnifyingglass")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(.secondary)
            Text(filter == .active ? "No active integrations" : "No results for \"\(searchText)\"")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Content

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Integrations")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                Text("Connect the apps JARVIS can act on.")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
            }

            Spacer()

            if let errorMessage = manager.errorMessage, !errorMessage.isEmpty {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.orange)
                    .help(errorMessage)
            }

            Button {
                showingKeyPrompt = true
            } label: {
                Image(systemName: "key.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(width: 26, height: 26)
                    .background(Color.white.opacity(0.08))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .help("API key settings")
        }
        .alert("API key settings", isPresented: $showingKeyPrompt) {
            SecureField("Composio API key", text: $draftAPIKey)
            Button("Save", action: saveAPIKey)
            Button("Remove key", role: .destructive) {
                manager.clearAPIKey()
                Task { await manager.reload() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The app ships with a built-in key. Paste your own to override it, or remove to restore the built-in one.")
        }
    }

    private var integrationList: some View {
        List {
            ForEach(filteredToolkits) { toolkit in
                IntegrationRowView(
                    toolkit: toolkit,
                    isConnected: manager.isConnected(toolkit),
                    isBusy: connectingSlug == toolkit.slug,
                    onConnect: { Task { await connect(toolkit) } },
                    onDisconnect: { Task { await disconnect(toolkit) } }
                )
                .listRowInsets(EdgeInsets(top: 3, leading: 0, bottom: 3, trailing: 0))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollIndicators(.never)
        .frame(height: visibleRowCount * rowHeight)
    }

    // MARK: Actions

    private func saveAPIKey() {
        let key = draftAPIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return }
        manager.setAPIKey(key)
        draftAPIKey = ""
        Task { await manager.reload() }
    }

    private func connect(_ toolkit: ComposioToolkit) async {
        connectingSlug = toolkit.slug
        defer { connectingSlug = nil }
        await manager.beginConnection(for: toolkit)
        // beginConnection publishes pendingConnectURL; the onChange handler
        // presents the auth session, and polling runs from there.
    }

    private func presentAuthSession(url: URL) async {
        let presenter = authSessionPresenter ?? ComposioAuthSessionPresenter()
        do {
            try await presenter.authenticate(url: url)
            if let toolkit = toolkit(for: connectingSlug ?? "") {
                await manager.pollForConnection(of: toolkit)
            }
        } catch {
            manager.reportError(error.localizedDescription)
        }
        manager.consumePendingConnectURL()
    }

    private func disconnect(_ toolkit: ComposioToolkit) async {
        connectingSlug = toolkit.slug
        defer { connectingSlug = nil }
        await manager.disconnect(toolkit)
    }

    // MARK: Helpers

    private func toolkit(for slug: String) -> ComposioToolkit? {
        manager.toolkits.first { $0.slug == slug }
    }

    private var filteredToolkits: [ComposioToolkit] {
        var result = manager.toolkits
        if filter == .active {
            result = result.filter { manager.isConnected($0) }
        }
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter {
                $0.name.lowercased().contains(query)
                    || ($0.description ?? "").lowercased().contains(query)
                    || ($0.categories ?? []).contains { $0.lowercased().contains(query) }
            }
        }
        return result
    }
}

#Preview {
    SettingsIntegrationsView()
        .frame(width: 640, height: 560)
        .background(Color.black)
}