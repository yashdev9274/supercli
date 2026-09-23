import SwiftUI

private enum SettingsDestination: String, CaseIterable, Identifiable {
    case general
    case connections

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var icon: String {
        switch self {
        case .general: return "slider.horizontal.3"
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
                        } else {
                            session.selectedModel = modelId
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
