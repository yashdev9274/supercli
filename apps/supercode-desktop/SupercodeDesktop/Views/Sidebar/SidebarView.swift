import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var workspace: WorkspaceStore
    @State private var showAccountMenu = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Top inset clears traffic lights while sidebar itself spans full window height.
            Color.clear.frame(height: 42)

            VStack(alignment: .leading, spacing: 6) {
                navRow(title: "Home", systemImage: "house", selected: conversations.activeConversationId == nil) {
                    conversations.activeConversationId = nil
                    conversations.messages = []
                }

                Button {
                    Task { await conversations.createConversation(mode: conversations.mode.rawValue) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                        Text("Create")
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
            Task { await conversations.selectConversation(id: item.id) }
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
                NSApp.sendAction(Selector(("showSettingsWindow:")), to: nil, from: nil)
                isPresented = false
            }

            menuButton(title: "Open Workspace…", systemImage: "folder") {
                workspace.pickWorkspace()
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
