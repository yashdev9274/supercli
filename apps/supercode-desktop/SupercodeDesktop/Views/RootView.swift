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
    @EnvironmentObject private var reviewStore: ReviewStore
    @State private var sidebarWidth: CGFloat = DesktopTheme.sidebarWidth
    @State private var inspectorWidth: CGFloat = DesktopTheme.inspectorDefaultWidth

    var body: some View {
        // Sidebar spans full window height; title bar only sits over the main/content column.
        HStack(spacing: 0) {
            if agentRun.isSidebarVisible {
                SidebarView()
                    .frame(width: sidebarWidth)
                    .frame(maxHeight: .infinity)

                SidebarResizeHandle(width: $sidebarWidth, range: 210...420, edge: .leading)
            }

            VStack(spacing: 0) {
                TitleBarView()
                Divider().overlay(DesktopTheme.border)
                if reviewStore.destination == .review {
                    ReviewWorkspaceView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if reviewStore.destination == .nova {
                    NovaSessionView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
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
                            SidebarResizeHandle(width: $inspectorWidth, range: 260...520, edge: .trailing)
                            RightSidebarView()
                                .frame(width: inspectorWidth)
                        }
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
            Task { await ConnectionsStore.shared.refresh() }
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

private struct SidebarResizeHandle: View {
    enum Edge {
        case leading
        case trailing
    }

    @Binding var width: CGFloat
    let range: ClosedRange<CGFloat>
    let edge: Edge
    @State private var initialWidth: CGFloat?
    @State private var hovering = false

    var body: some View {
        Rectangle()
            .fill(hovering ? DesktopTheme.accent.opacity(0.55) : DesktopTheme.border)
            .frame(width: 5)
            .contentShape(Rectangle())
            .onHover { isHovering in
                hovering = isHovering
                if isHovering {
                    NSCursor.resizeLeftRight.push()
                } else {
                    NSCursor.pop()
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        let start = initialWidth ?? width
                        initialWidth = start
                        let delta = edge == .leading ? value.translation.width : -value.translation.width
                        width = min(max(start + delta, range.lowerBound), range.upperBound)
                    }
                    .onEnded { _ in initialWidth = nil }
            )
    }
}

struct TitleBarView: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @EnvironmentObject private var reviewStore: ReviewStore

    var body: some View {
        HStack(spacing: 12) {
            if reviewStore.destination == .review {
                destinationTitle(symbol: "arrow.triangle.pull", title: "Supercode Review", detail: "AI code review")
            } else if reviewStore.destination == .nova {
                destinationTitle(symbol: "sparkles", title: "Nova", detail: "Company agent")
            } else {
            // No logo here — logo lives in empty chat / auth / dock only.
            if !agentRun.isSidebarVisible {
                Button {
                    agentRun.isSidebarVisible = true
                } label: {
                    Image(systemName: "sidebar.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textSecondary)
                }
                .buttonStyle(.plain)
                .help("Show sidebar (⌘B)")
                .padding(.leading, 14)
            }

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
                ReviewStore.shared.showHome()
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
        }
        .frame(height: 42)
        .background(DesktopTheme.panel)
    }

    private func destinationTitle(symbol: String, title: String, detail: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(DesktopTheme.accent)
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DesktopTheme.textPrimary)
            Spacer()
            Text(detail)
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
        }
        .padding(.horizontal, 16)
    }
}

private enum NovaTimelineItem: Identifiable {
    case message(NovaSessionMessage)
    case activity(NovaSessionActivity)

    var id: String {
        switch self {
        case .message(let value): return "message:\(value.id)"
        case .activity(let value): return "activity:\(value.id)"
        }
    }

    var sequence: Int {
        switch self {
        case .message(let value): return value.sequence
        case .activity(let value): return value.sequence
        }
    }
}

struct NovaSessionView: View {
    @EnvironmentObject private var connections: ConnectionsStore

    private var timeline: [NovaTimelineItem] {
        guard let id = connections.selectedNovaSessionId else { return [] }
        let messages = (connections.novaMessages[id] ?? []).map(NovaTimelineItem.message)
        let activities = (connections.novaActivities[id] ?? []).map(NovaTimelineItem.activity)
        return (messages + activities).sorted { $0.sequence < $1.sequence }
    }

    var body: some View {
        Group {
            if let session = connections.selectedNovaSession {
                VStack(spacing: 0) {
                    header(session)
                    Divider().overlay(DesktopTheme.border)
                    let approvals = connections.approvals(for: session.id)
                    if !approvals.isEmpty {
                        approvalInbox(approvals)
                        Divider().overlay(DesktopTheme.border)
                    }
                    if timeline.isEmpty {
                        ContentUnavailableView(
                            "Waiting for Nova",
                            systemImage: "sparkles",
                            description: Text("Messages and activity from connected surfaces will appear here.")
                        )
                    } else {
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 14) {
                                ForEach(timeline) { item in
                                    row(item)
                                }
                            }
                            .padding(24)
                        }
                    }
                    if let error = connections.errorMessage {
                        Text(error)
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(.red)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            } else {
                ContentUnavailableView(
                    "Select a Nova session",
                    systemImage: "sparkles",
                    description: Text("Choose a company session in the sidebar or create a new one.")
                )
            }
        }
        .foregroundStyle(DesktopTheme.textSecondary)
        .background(DesktopTheme.background)
        .task(id: connections.selectedNovaSessionId) {
            guard let id = connections.selectedNovaSessionId else { return }
            while !Task.isCancelled {
                await connections.syncNovaSession(id)
                try? await Task.sleep(nanoseconds: 5_000_000_000)
            }
        }
    }

    private func header(_ session: NovaSessionSummary) -> some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(session.objective)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .textSelection(.enabled)
                HStack(spacing: 8) {
                    Text(session.status.capitalized)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(DesktopTheme.accentSoft))
                    if !session.sourceLabel.isEmpty {
                        Text(session.sourceLabel)
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
                }
            }
            Spacer()
            ForEach(session.surfaces) { surface in
                if let url = surface.externalUrl {
                    Link(destination: url) {
                        Image(systemName: "arrow.up.right.square")
                    }
                    .help("Open \(surface.provider.capitalized)")
                }
            }
            Button {
                Task { await connections.syncNovaSession(session.id) }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.plain)
            .help("Sync now")
        }
        .padding(20)
        .background(DesktopTheme.panel)
    }

    private func approvalInbox(_ approvals: [NovaApproval]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Approval required", systemImage: "checkmark.shield")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DesktopTheme.textPrimary)

            ForEach(approvals) { approval in
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(approval.capability.replacingOccurrences(of: "_", with: " ").capitalized)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(DesktopTheme.textPrimary)
                        if let mutation = approval.mutation {
                            Text(mutation.target.description)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(DesktopTheme.textSecondary)
                            Text(mutation.text)
                                .font(.system(size: 12))
                                .foregroundStyle(DesktopTheme.textPrimary)
                                .lineLimit(4)
                                .textSelection(.enabled)
                        }
                        Text("Run \(approval.runId.prefix(8)) · Expires \(approval.expiresAt)")
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button("Deny", role: .destructive) {
                        Task { await connections.decideNovaApproval(approval, decision: "denied") }
                    }
                    .disabled(connections.decidingApprovalId != nil)
                    Button("Approve") {
                        Task { await connections.decideNovaApproval(approval, decision: "approved") }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(DesktopTheme.accent)
                    .disabled(connections.decidingApprovalId != nil)
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(DesktopTheme.panelElevated)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(DesktopTheme.border))
                )
            }
        }
        .padding(16)
        .background(DesktopTheme.panel)
    }

    @ViewBuilder
    private func row(_ item: NovaTimelineItem) -> some View {
        switch item {
        case .message(let message):
            HStack {
                if message.role == "user" { Spacer(minLength: 80) }
                VStack(alignment: .leading, spacing: 5) {
                    Text(message.role == "assistant" ? "Nova" : message.role.capitalized)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(message.role == "assistant" ? DesktopTheme.accent : DesktopTheme.textMuted)
                    Text(message.content)
                        .font(.system(size: 13))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .textSelection(.enabled)
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(message.role == "user" ? DesktopTheme.userBubble : DesktopTheme.panelElevated)
                )
                if message.role != "user" { Spacer(minLength: 40) }
            }
        case .activity(let activity):
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: activity.type == "error" ? "exclamationmark.triangle" : "waveform.path.ecg")
                    .foregroundStyle(activity.type == "error" ? Color.red : DesktopTheme.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(activity.title ?? activity.type.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.system(size: 12, weight: .semibold))
                    if let body = activity.body, !body.isEmpty {
                        Text(body)
                            .font(.system(size: 12))
                            .foregroundStyle(DesktopTheme.textMuted)
                            .textSelection(.enabled)
                    }
                }
                Spacer()
                Text(activity.status.capitalized)
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(DesktopTheme.panel)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(DesktopTheme.border))
            )
        }
    }
}
