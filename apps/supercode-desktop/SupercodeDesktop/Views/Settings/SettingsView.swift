import SwiftUI

private enum SettingsDestination: String, CaseIterable, Identifiable {
    case general
    case openCode
    case connections

    var id: String { rawValue }
    var title: String {
        switch self {
        case .general: return "General"
        case .openCode: return "OpenCode"
        case .connections: return "Connections"
        }
    }
    var icon: String {
        switch self {
        case .general: return "slider.horizontal.3"
        case .openCode: return "terminal"
        case .connections: return "point.3.connected.trianglepath.dotted"
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var connections: ConnectionsStore
    @State private var destination: SettingsDestination = .general

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Settings")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)

                ForEach(SettingsDestination.allCases) { item in
                    Button {
                        destination = item
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: item.icon)
                                .frame(width: 18)
                            Text(item.title)
                            Spacer()
                            if item == .connections, connections.connectedCount > 0 {
                                Text("\(connections.connectedCount)")
                                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                                    .padding(.horizontal, 7)
                                    .padding(.vertical, 2)
                                    .background(DesktopTheme.accentSoft, in: Capsule())
                                    .foregroundStyle(DesktopTheme.accent)
                            }
                        }
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(destination == item ? DesktopTheme.textPrimary : DesktopTheme.textSecondary)
                        .padding(.horizontal, 10)
                        .frame(height: 34)
                        .background(destination == item ? DesktopTheme.panelElevated : .clear, in: RoundedRectangle(cornerRadius: 7))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(item.title) settings")
                }
                Spacer()
            }
            .padding(12)
            .frame(width: 190)
            .background(DesktopTheme.panel)

            Divider().overlay(DesktopTheme.border)

            Group {
                switch destination {
                case .general:
                    GeneralSettingsView()
                case .openCode:
                    OpenCodeSettingsView()
                case .connections:
                    ConnectionsSettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DesktopTheme.background)
        }
        .frame(width: 780, height: 580)
        .preferredColorScheme(.dark)
    }
}

private struct OpenCodeSettingsView: View {
    @EnvironmentObject private var openCode: OpenCodeProfileStore

    var body: some View {
        Form {
            Section("Local OpenCode profile") {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(openCode.state.label)
                        Text("SuperCode connects to an app-owned localhost service. Provider credentials stay in OpenCode on this Mac.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if case .starting = openCode.state {
                        ProgressView()
                            .controlSize(.small)
                    }
                }

                HStack {
                    Button(openCode.models.isEmpty ? "Connect Profile" : "Refresh Models") {
                        Task { await openCode.refresh() }
                    }
                    .disabled(openCode.state == .starting)

                    if !openCode.models.isEmpty {
                        Button("Disconnect") { openCode.stop() }
                    }
                }
            }

            if !openCode.models.isEmpty {
                Section("Available models") {
                    LabeledContent("Connected providers", value: "\(openCode.providers.count)")
                    LabeledContent("Available models", value: "\(openCode.models.count)")
                    ForEach(openCode.providers, id: \.id) { provider in
                        LabeledContent(provider.name, value: "\(openCode.models(providerID: provider.id).count)")
                    }
                }
            }

            Section("Current limitation") {
                Text("OpenCode models are used as a text and reasoning layer in Chat, Plan, Tools, and Agent modes. OpenCode tools are disabled, and SuperCode tool execution is not yet bridged for this model source.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .task {
            if case .idle = openCode.state {
                await openCode.refresh()
            }
        }
    }
}

private struct GeneralSettingsView: View {
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var workspace: WorkspaceStore

    var body: some View {
        Form {
            Section("Server") {
                TextField("Server URL", text: Binding(
                    get: { session.serverURL },
                    set: { session.updateServerURL($0) }
                ))
                HStack {
                    Button("Use local API") { session.useLocalServer() }
                    Button("Use production API") { session.useProductionServer() }
                }
                Text(ServerConfig.buildDefaultHelp)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Model") {
                LabeledContent("Source", value: session.selectedModelSource == .openCode ? "OpenCode Profile" : "Supercode")
                if session.selectedModelSource == .supercode {
                    Picker("Provider", selection: Binding(
                        get: { session.selectedProvider },
                        set: { raw in
                            if let provider = ModelCatalog.Provider(rawValue: raw) {
                                session.selectProvider(provider)
                            }
                        }
                    )) {
                        ForEach(ModelCatalog.Provider.allCases) { provider in
                            Text(provider.label).tag(provider.rawValue)
                        }
                    }
                    Picker("Model", selection: Binding(
                        get: { session.selectedModel },
                        set: { modelId in
                            if let entry = ModelCatalog.find(provider: session.selectedProvider, model: modelId) {
                                session.selectModel(entry)
                            }
                        }
                    )) {
                        ForEach(
                            ModelCatalog.models(for: ModelCatalog.Provider(rawValue: session.selectedProvider) ?? .supercode),
                            id: \.menuId
                        ) { entry in
                            Text(entry.label).tag(entry.id)
                        }
                    }
                } else {
                    LabeledContent("Provider", value: session.selectedProvider)
                    LabeledContent("Model", value: session.selectedModel)
                    Button("Use Supercode Cloud") {
                        session.selectModel(ModelCatalog.cloudModels[0])
                    }
                }
                Picker("Effort", selection: Binding(
                    get: { session.selectedEffort },
                    set: { session.persistEffort($0) }
                )) {
                    ForEach(EffortLevel.allCases) { level in
                        Text(level.title).tag(level)
                    }
                }
            }
            Section("Workspace") {
                Text(workspace.path ?? "None")
                Button("Choose Workspace…") { workspace.pickWorkspace() }
            }
            Section("Account") {
                HStack {
                    UserAvatarView(size: 28)
                    VStack(alignment: .leading) {
                        Text(session.accountDisplayName)
                        Text(session.user?.email ?? "Not signed in")
                            .foregroundStyle(.secondary)
                    }
                }
                Button("Sign Out", role: .destructive) { session.signOut() }
            }
            Section("Permissions") {
                Text("Local mutations and connected-service actions prompt for approval.")
                    .foregroundStyle(.secondary)
                Button("Clear always-allow list") {
                    PermissionManager.shared.clearAlwaysAllows()
                }
            }
        }
        .formStyle(.grouped)
    }
}
