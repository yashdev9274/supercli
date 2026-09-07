import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var agentRun: AgentRunStore

    var body: some View {
        Group {
            if session.isBootstrapping {
                ZStack {
                    DesktopTheme.background.ignoresSafeArea()
                    ProgressView("Starting Supercode…")
                        .tint(DesktopTheme.accent)
                        .foregroundStyle(DesktopTheme.textSecondary)
                }
            } else if !session.isAuthenticated {
                AuthView()
            } else {
                DesktopShellView()
            }
        }
    }
}

struct DesktopShellView: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @State private var sidebarWidth: CGFloat = DesktopTheme.sidebarWidth
    @State private var inspectorWidth: CGFloat = DesktopTheme.inspectorDefaultWidth

    var body: some View {
        // Sidebar spans full window height; title bar only sits over the main/content column.
        HStack(spacing: 0) {
            SidebarView()
                .frame(width: sidebarWidth)
                .frame(maxHeight: .infinity)

            Divider().overlay(DesktopTheme.border)

            VStack(spacing: 0) {
                TitleBarView()
                Divider().overlay(DesktopTheme.border)
HStack(spacing: 0) {
                    Group {
                        if workspace.mainPane == .file {
                            FileViewerPane()
                        } else {
                            ChatPaneView()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    if agentRun.isInspectorVisible {
                        Divider().overlay(DesktopTheme.border)
                        RightSidebarView()
                            .frame(width: inspectorWidth)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(DesktopTheme.background)
        .onDrop(of: [.fileURL], isTargeted: nil) { providers in
            handleDrop(providers)
        }
        .onAppear {
            if workspace.path != nil && workspace.rootNodes.isEmpty {
                workspace.reloadTree()
            }
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        for provider in providers {
            provider.loadItem(forTypeIdentifier: "public.file-url", options: nil) { item, _ in
                guard let data = item as? Data,
                      let url = URL(dataRepresentation: data, relativeTo: nil)
                else { return }
                Task { @MainActor in
                    var isDir: ObjCBool = false
                    if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), isDir.boolValue {
                        WorkspaceStore.shared.openPath(url.path)
                    }
                }
            }
        }
        return true
    }
}

struct TitleBarView: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var agentRun: AgentRunStore

    var body: some View {
        HStack(spacing: 12) {
            // No logo here — logo lives in empty chat / auth / dock only.
            HStack(spacing: 6) {
                ForEach(Array(workspace.breadcrumbSegments().enumerated()), id: \.offset) { index, segment in
                    if index > 0 {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
                    Text(segment)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(index == workspace.breadcrumbSegments().count - 1
                                         ? DesktopTheme.textPrimary
                                         : DesktopTheme.textSecondary)
                }
            }
            .padding(.leading, 16)

            if let branch = workspace.gitBranch {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.triangle.branch")
                        .font(.system(size: 10, weight: .semibold))
                    Text(branch)
                        .font(DesktopTheme.monoTiny)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Capsule().fill(DesktopTheme.panelElevated))
                .overlay(Capsule().stroke(DesktopTheme.border, lineWidth: 1))
                .foregroundStyle(DesktopTheme.textSecondary)
            }

Spacer()

            if workspace.mainPane == .file {
                Button {
                    workspace.showChatPane()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bubble.left.and.bubble.right")
                            .font(.system(size: 10, weight: .semibold))
                        Text("Chat")
                            .font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(DesktopTheme.panelElevated))
                    .overlay(Capsule().stroke(DesktopTheme.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .help("Back to chat")
            }

            Button {
                Task { await ConversationStore.shared.clearSessionAndStartNew() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 10, weight: .semibold))
                    Text("New Chat")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(DesktopTheme.textPrimary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(DesktopTheme.panelElevated)
                        .overlay(Capsule().stroke(DesktopTheme.borderStrong, lineWidth: 1))
                )
            }
            .buttonStyle(.plain)
            .help("Start a new conversation")

            Text(agentRun.status.label)
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)

            Button {
                agentRun.isInspectorVisible.toggle()
            } label: {
                Image(systemName: "sidebar.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(agentRun.isInspectorVisible ? DesktopTheme.accent : DesktopTheme.textSecondary)
            }
            .buttonStyle(.plain)
            .help("Toggle files sidebar")
            .padding(.trailing, 12)
        }
        .frame(height: 42)
        .background(DesktopTheme.panel)
    }
}
