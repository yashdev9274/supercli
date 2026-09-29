import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var reviewStore: ReviewStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @EnvironmentObject private var connections: ConnectionsStore
    @State private var showAccountMenu = false
    @State private var showNewNovaSession = false
    @State private var newNovaObjective = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top inset clears traffic lights while sidebar itself spans full window height.
            HStack {
                Spacer()
                Button {
                    agentRun.isSidebarVisible = false
                } label: {
                    Image(systemName: "sidebar.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .help("Hide sidebar (⌘B)")
            }
            .frame(height: 42)
            .padding(.trailing, 8)

            VStack(alignment: .leading, spacing: 6) {
                navRow(title: "Home", systemImage: "house", selected: reviewStore.destination == .home) {
                    reviewStore.showHome()
                    conversations.activeConversationId = nil
                    conversations.clearActiveSession()
                }

                navRow(title: "Review", systemImage: "arrow.triangle.pull", selected: reviewStore.destination == .review) {
                    reviewStore.showReview()
                }

Button {
                    Task {
                        reviewStore.showHome()
                        WorkspaceStore.shared.showChatPane()
                        await conversations.createConversation(mode: conversations.mode.rawValue)
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "square.and.pencil")
                            .font(.system(size: 11, weight: .bold))
                        Text("New Chat")
                            .font(.system(size: 12, weight: .semibold))
                        Spacer()
                    }
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(DesktopTheme.panelElevated)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(DesktopTheme.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)

                Button {
                    conversations.clearActiveSession()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                            .font(.system(size: 11, weight: .semibold))
                        Text("Clear session")
                            .font(.system(size: 12, weight: .medium))
                        Spacer()
                    }
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(DesktopTheme.background)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(DesktopTheme.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .help("Clear the current chat transcript (keeps the project in the list)")
                .disabled(conversations.messages.isEmpty)
                .opacity(conversations.messages.isEmpty ? 0.45 : 1)

                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textMuted)
                    TextField("Search", text: $conversations.searchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(DesktopTheme.background)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(DesktopTheme.border, lineWidth: 1)
                )
            }
            .padding(.horizontal, 12)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    novaSessionsSection
                    projectsSection

                    if !conversations.personalConversations.isEmpty {
                        sectionHeader("Personal", count: conversations.personalConversations.count)
                        ForEach(conversations.personalConversations) { item in
                            conversationRow(item)
                        }
                    }
                }
                .padding(.top, 14)
                .padding(.bottom, 12)
            }

            Spacer(minLength: 0)

            Divider().overlay(DesktopTheme.border)

            accountFooter
        }
        .background(DesktopTheme.panel)
        .alert("New Nova session", isPresented: $showNewNovaSession) {
            TextField("What should Nova help with?", text: $newNovaObjective)
            Button("Cancel", role: .cancel) { newNovaObjective = "" }
            Button("Create") {
                let objective = newNovaObjective
                newNovaObjective = ""
                Task {
                    if await connections.createNovaSession(objective: objective) != nil {
                        reviewStore.showNova()
                    }
                }
            }
            .disabled(newNovaObjective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        } message: {
            Text("This creates a company-aware session that can synchronize with connected provider surfaces.")
        }
    }


    private var novaSessionsSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                sectionHeader("Nova", count: connections.novaSessions.count)
                if !connections.pendingNovaApprovals.isEmpty {
                    Text("\(connections.pendingNovaApprovals.count)")
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.orange))
                }
                Button {
                    showNewNovaSession = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(DesktopTheme.textMuted)
                }
                .buttonStyle(.plain)
                .help("New Nova session")
                .padding(.trailing, 14)
            }
            if connections.novaSessions.isEmpty {
                Text("No company sessions yet")
                    .font(.system(size: 11))
                    .foregroundStyle(DesktopTheme.textMuted)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
            } else {
                ForEach(connections.novaSessions.prefix(20)) { session in
                    let selected = reviewStore.destination == .nova && connections.selectedNovaSessionId == session.id
                    Button {
                        reviewStore.showNova()
                        Task { await connections.selectNovaSession(session.id) }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 11))
                                .foregroundStyle(selected ? DesktopTheme.accent : DesktopTheme.textMuted)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(session.objective)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(DesktopTheme.textPrimary)
                                    .lineLimit(1)
                                Text(session.sourceLabel.isEmpty ? session.status.capitalized : session.sourceLabel)
                                    .font(DesktopTheme.monoTiny)
                                    .foregroundStyle(DesktopTheme.textMuted)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(selected ? DesktopTheme.panelElevated : Color.clear)
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 8)
                    .help("Sync Nova session activity from every connected surface")
                }
            }
        }
    }

    private var projectsSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            sectionHeader("Projects", count: conversations.filteredConversations.count)

            if conversations.filteredConversations.isEmpty {
                Text("No projects yet")
                    .font(.system(size: 11))
                    .foregroundStyle(DesktopTheme.textMuted)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
            } else {
                ForEach(conversations.filteredConversations) { item in
                    conversationRow(item)
                }
            }
        }
    }

    private func sectionHeader(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(DesktopTheme.textMuted)
            Spacer()
            Text("\(count)")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 2)
    }

    private func conversationRow(_ item: ConversationSummary) -> some View {
        let selected = conversations.activeConversationId == item.id
        return Button {
            Task {
                reviewStore.showHome()
                await conversations.selectConversation(id: item.id)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "folder")
                    .font(.system(size: 11))
                    .foregroundStyle(selected ? DesktopTheme.accent : DesktopTheme.textMuted)
                Text(item.displayTitle)
                    .font(.system(size: 12, weight: selected ? .semibold : .regular))
                    .foregroundStyle(selected ? DesktopTheme.textPrimary : DesktopTheme.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                if let mode = AgentMode(rawValue: item.mode) {
                    Text(String(mode.title.prefix(1)))
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(selected ? DesktopTheme.panelElevated : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(selected ? DesktopTheme.border : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
    }

    private func navRow(title: String, systemImage: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 14)
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                Spacer()
            }
            .foregroundStyle(selected ? DesktopTheme.textPrimary : DesktopTheme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(selected ? DesktopTheme.panelElevated : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var accountFooter: some View {
        Button {
            showAccountMenu.toggle()
        } label: {
            HStack(spacing: 10) {
                UserAvatarView(size: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.accountDisplayName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .lineLimit(1)
                    Text(session.user?.email ?? workspace.displayName)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(DesktopTheme.textMuted)
            }
            .padding(12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showAccountMenu, arrowEdge: .top) {
            AccountMenuView(isPresented: $showAccountMenu)
                .environmentObject(session)
                .environmentObject(workspace)
        }
    }
}

struct UserAvatarView: View {
    @EnvironmentObject private var session: AppSessionStore
    var size: CGFloat = 28

    var body: some View {
        ZStack {
            if let image = session.avatarImage {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Circle().fill(DesktopTheme.accentSoft)
                Text(initials)
                    .font(.system(size: size * 0.36, weight: .bold))
                    .foregroundStyle(DesktopTheme.accent)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(DesktopTheme.border, lineWidth: 1))
    }

    private var initials: String {
        let name = session.user?.name ?? session.user?.email ?? "SC"
        let parts = name.split(separator: " ")
        if parts.count >= 2 {
            return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }
}

struct AccountMenuView: View {
    @Environment(\.openSettings) private var openSettings
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var workspace: WorkspaceStore
    @Binding var isPresented: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                UserAvatarView(size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.accountDisplayName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .lineLimit(1)
                    Text(session.user?.email ?? "No email")
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .lineLimit(1)
                }
            }
            .padding(14)

            Divider().overlay(DesktopTheme.border)

            menuButton(title: "Upgrade to Pro", systemImage: "sparkles") {
                if let url = URL(string: "https://supercode.ai/pricing") {
                    NSWorkspace.shared.open(url)
                }
                isPresented = false
            }

            menuButton(title: "Settings", systemImage: "gearshape") {
                isPresented = false
                DispatchQueue.main.async {
                    openSettings()
                }
            }

menuButton(title: "Open Workspace…", systemImage: "folder") {
                workspace.pickWorkspace()
                isPresented = false
            }

            menuButton(title: "Clear session", systemImage: "trash") {
                ConversationStore.shared.clearActiveSession()
                isPresented = false
            }

            menuButton(title: "New session", systemImage: "arrow.counterclockwise") {
                Task {
                    await ConversationStore.shared.clearSessionAndStartNew()
                }
                isPresented = false
            }

            Divider().overlay(DesktopTheme.border)

            menuButton(title: "Log out", systemImage: "rectangle.portrait.and.arrow.right", destructive: true) {
                session.signOut()
                isPresented = false
            }
        }
        .frame(width: 260)
        .background(DesktopTheme.panel)
    }

    private func menuButton(title: String, systemImage: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 12, weight: .semibold))
                    .frame(width: 16)
                Text(title)
                    .font(.system(size: 12, weight: .medium))
                Spacer()
            }
            .foregroundStyle(destructive ? DesktopTheme.danger : DesktopTheme.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
