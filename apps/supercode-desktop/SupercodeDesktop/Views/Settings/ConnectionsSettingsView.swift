import SwiftUI

struct ConnectionsSettingsView: View {
    @EnvironmentObject private var connections: ConnectionsStore
    @State private var searchText = ""
    @State private var pendingDisconnect: ConnectedApp?

    private var filteredApps: [ConnectedApp] {
        guard !searchText.isEmpty else { return connections.apps }
        return connections.apps.filter {
            $0.name.localizedCaseInsensitiveContains(searchText)
                || $0.description.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Connections")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Text("Install Nova in company apps and separately connect delegated tools.")
                        .font(.system(size: 13))
                        .foregroundStyle(DesktopTheme.textSecondary)
                }
                Spacer()
                Button {
                    Task { await connections.refresh() }
                } label: {
                    if connections.isLoading {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(connections.isLoading)
            }
            .padding(.bottom, 18)

            HStack(spacing: 10) {
                Image(systemName: "sparkles")
                    .foregroundStyle(DesktopTheme.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Nova and delegated tools")
                        .font(.system(size: 12, weight: .semibold))
                    Text("\(connections.readyNovaConnectorCount) Nova apps ready · \(connections.connectedCount) tool accounts · \(connections.availableToolCount) tools")
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textSecondary)
                }
                Spacer()
            }
            .padding(12)
            .background(DesktopTheme.accentSoft, in: RoundedRectangle(cornerRadius: 9))
            .overlay(RoundedRectangle(cornerRadius: 9).stroke(DesktopTheme.accent.opacity(0.28)))
            .padding(.bottom, 14)

            TextField("Search connections", text: $searchText)
                .textFieldStyle(.roundedBorder)
                .padding(.bottom, 14)

            if let error = connections.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(DesktopTheme.danger)
                    .padding(.bottom, 12)
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    novaConnectorSection
                    connectionSection("Delegated tool accounts — connected", apps: filteredApps.filter(\.connected))
                    connectionSection("Delegated tool accounts — available", apps: filteredApps.filter { !$0.connected })
                }
            }
        }
        .padding(26)
        .task {
            if connections.apps.isEmpty {
                await connections.refresh()
            }
        }
        .confirmationDialog(
            "Disconnect \(pendingDisconnect?.name ?? "service")?",
            isPresented: Binding(
                get: { pendingDisconnect != nil },
                set: { if !$0 { pendingDisconnect = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) {
                guard let app = pendingDisconnect else { return }
                pendingDisconnect = nil
                Task { await connections.disconnect(app) }
            }
        } message: {
            Text("Supercode will no longer be able to use this service's tools.")
        }
    }

    @ViewBuilder
    private var novaConnectorSection: some View {
        let connectors = connections.novaConnectors.filter {
            searchText.isEmpty || $0.provider.displayName.localizedCaseInsensitiveContains(searchText)
        }
        if !connectors.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("NOVA BOT INSTALLATIONS")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(DesktopTheme.textMuted)
                Text("Install Nova's native identity so teammates can mention or assign it. This does not grant mutation or local execution permission.")
                    .font(.system(size: 11))
                    .foregroundStyle(DesktopTheme.textSecondary)
                VStack(spacing: 0) {
                    ForEach(Array(connectors.enumerated()), id: \.element.id) { index, connector in
                        novaConnectorRow(connector)
                        if index < connectors.count - 1 {
                            Divider().overlay(DesktopTheme.border).padding(.leading, 58)
                        }
                    }
                }
                .background(DesktopTheme.panelElevated, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(DesktopTheme.border))
            }
        }
    }

    private func novaConnectorRow(_ connector: NovaConnectorStatus) -> some View {
        HStack(spacing: 12) {
            Image(systemName: connector.provider.systemImage)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(DesktopTheme.accent)
                .frame(width: 34, height: 34)
                .background(DesktopTheme.accentSoft, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text("Nova for \(connector.provider.displayName)")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DesktopTheme.textPrimary)
                Text(connector.statusMessage ?? connector.stateLabel)
                    .font(.system(size: 11))
                    .foregroundStyle(connector.ready ? DesktopTheme.success : DesktopTheme.textSecondary)
                    .lineLimit(2)
            }
            Spacer()
            if connections.installingNovaProvider == connector.provider {
                ProgressView().controlSize(.small)
            } else if connector.ready {
                Label("Ready", systemImage: "checkmark.circle.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(DesktopTheme.success)
            } else {
                Button(connector.botInstallation == nil ? "Install" : "Reconnect") {
                    connections.installNova(connector)
                }
                .buttonStyle(.borderedProminent)
                .tint(DesktopTheme.accent)
                .disabled(connector.authorizeUrl == nil)
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 64)
    }

    @ViewBuilder
    private func connectionSection(_ title: String, apps: [ConnectedApp]) -> some View {
        if !apps.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(title.uppercased())
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(0.8)
                    .foregroundStyle(DesktopTheme.textMuted)
                VStack(spacing: 0) {
                    ForEach(Array(apps.enumerated()), id: \.element.id) { index, app in
                        connectionRow(app)
                        if index < apps.count - 1 {
                            Divider().overlay(DesktopTheme.border).padding(.leading, 58)
                        }
                    }
                }
                .background(DesktopTheme.panelElevated, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(DesktopTheme.border))
            }
        }
    }

    private func connectionRow(_ app: ConnectedApp) -> some View {
        HStack(spacing: 12) {
            ConnectionLogoView(url: app.logo, name: app.name)

            VStack(alignment: .leading, spacing: 2) {
                Text(app.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DesktopTheme.textPrimary)
                Text(app.connected ? "Connected" : app.description)
                    .font(.system(size: 11))
                    .foregroundStyle(app.connected ? DesktopTheme.success : DesktopTheme.textSecondary)
                    .lineLimit(1)
            }
            Spacer()

            if connections.connectingSlug == app.slug || connections.disconnectingSlug == app.slug {
                ProgressView().controlSize(.small)
            } else if app.connected {
                Button("Disconnect", role: .destructive) {
                    pendingDisconnect = app
                }
                .buttonStyle(.borderless)
            } else {
                Button("Connect") {
                    connections.connect(app)
                }
                .buttonStyle(.borderedProminent)
                .tint(DesktopTheme.accent)
            }
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 58)
    }
}
