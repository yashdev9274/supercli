import SwiftUI

struct ChatPaneView: View {
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var permissions: PermissionManager

var body: some View {
        ZStack {
            VStack(spacing: 0) {
                // Empty splash only when idle with no transcript. As soon as the
                // user sends (or generation starts), the result pane owns the screen.
                if showEmptySplash {
                    emptyState
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 18) {
                                if !agentRun.agentTodos.isEmpty {
                                    AgentTodoBanner(todos: agentRun.agentTodos)
                                }
                                ForEach(conversations.messages) { message in
                                    MessageBubble(message: message)
                                        .id(message.id)
                                }
                                if agentRun.status != .idle && agentRun.status != .error {
                                    HStack(spacing: 8) {
                                        ProgressView().controlSize(.small)
                                        Text(statusLabel)
                                            .font(DesktopTheme.monoTiny)
                                            .foregroundStyle(DesktopTheme.textMuted)
                                        if agentRun.stepCount > 0 {
                                            Text("step \(agentRun.stepCount)")
                                                .font(DesktopTheme.monoTiny)
                                                .foregroundStyle(DesktopTheme.textMuted)
                                        }
                                    }
                                    .padding(.leading, 8)
                                    .id("status")
                                }
                                Color.clear.frame(height: 1).id("bottom")
                            }
                            .padding(24)
                        }
                        .onChange(of: conversations.messages.count) { _, _ in
                            scrollToBottom(proxy)
                        }
                        .onChange(of: streamFingerprint) { _, _ in
                            scrollToBottom(proxy, animated: false)
                        }
                        .onChange(of: agentRun.status) { _, _ in
                            scrollToBottom(proxy)
                        }
                    }
                }

                if let error = agentRun.lastError {
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 6)
                }

                ComposerBar()
            }

            if let pending = permissions.pending {
                PermissionPromptOverlay(request: pending)
            }
        }
        .background(DesktopTheme.background)
    }

private var statusLabel: String {
        if agentRun.status == .needsPermission {
            return "Waiting for permission"
        }
        return agentRun.status.label
    }

    /// Splash only when there is no transcript and the agent is not running.
    private var showEmptySplash: Bool {
        conversations.messages.isEmpty && (agentRun.status == .idle || agentRun.status == .error)
    }

    /// Cheap fingerprint so we re-scroll while assistant content streams in.
    private var streamFingerprint: String {
        guard let last = conversations.messages.last else { return "" }
        let partCount = last.parts.count
        let tail = last.content.suffix(48)
        return "\(last.id):\(partCount):\(last.content.count):\(tail)"
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool = true) {
        let action = {
            if agentRun.status != .idle && agentRun.status != .error {
                proxy.scrollTo("bottom", anchor: .bottom)
            } else if let last = conversations.messages.last?.id {
                proxy.scrollTo(last, anchor: .bottom)
            }
        }
        if animated {
            withAnimation(.easeOut(duration: 0.15), action)
        } else {
            action()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 120, height: 68)
                .accessibilityLabel("Supercode logo")

            Text("Supercode Agent")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(DesktopTheme.textPrimary)

            Text(workspace.path == nil
                 ? "Open a workspace, then describe what you want to build or fix."
                 : "Ask the agent to explore, edit, or ship changes in \(workspace.displayName).")
                .font(.system(size: 13))
                .foregroundStyle(DesktopTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)

            if workspace.path == nil {
                Button("Open Workspace…") { workspace.pickWorkspace() }
                    .buttonStyle(.borderedProminent)
                    .tint(DesktopTheme.accent)
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        switch message.role {
        case .user:
            HStack {
                Spacer(minLength: 80)
                Text(message.content)
                    .font(.system(size: 13))
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(DesktopTheme.userBubble)
                    )
            }
case .assistant:
            VStack(alignment: .leading, spacing: 10) {
                if message.parts.isEmpty {
                    if message.content.isEmpty {
                        streamingPlaceholder
                    } else {
                        markdownText(message.content)
                    }
                } else {
                    ForEach(message.parts) { part in
                        switch part {
                        case .text(_, let content):
                            if content.isEmpty {
                                EmptyView()
                            } else {
                                markdownText(content)
                            }
                        case .reasoning(_, let content):
                            DisclosureGroup {
                                Text(content)
                                    .font(DesktopTheme.monoSmall)
                                    .foregroundStyle(DesktopTheme.textMuted)
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            } label: {
                                Label("Thinking", systemImage: "brain.head.profile")
                                    .font(DesktopTheme.monoTiny)
                                    .foregroundStyle(DesktopTheme.textMuted)
                            }
                        case .toolCall(let tool):
                            ToolCallCard(tool: tool)
                        }
                    }
                    if message.content.isEmpty && message.parts.allSatisfy({ part in
                        if case .toolCall = part { return true }
                        if case .reasoning = part { return true }
                        if case .text(_, let c) = part { return c.isEmpty }
                        return false
                    }) {
                        // Still generating first text after tools / thinking
                        EmptyView()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 40)
        default:
            Text(message.content)
                .font(DesktopTheme.monoSmall)
                .foregroundStyle(DesktopTheme.textMuted)
        }
    }

    private var streamingPlaceholder: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.mini)
            Text("Generating…")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func markdownText(_ text: String) -> some View {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            EmptyView()
        } else if let attributed = try? AttributedString(
            markdown: text,
            options: AttributedString.MarkdownParsingOptions(
                interpretedSyntax: .inlineOnlyPreservingWhitespace
            )
        ) {
            Text(attributed)
                .font(.system(size: 13.5))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineSpacing(3)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(text)
                .font(.system(size: 13.5))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineSpacing(3)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct ToolCallCard: View {
    let tool: ToolCallPart
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                expanded.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: iconName)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(DesktopTheme.accent)
                    Text(tool.displayName)
                        .font(DesktopTheme.monoSmall)
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Text(tool.primaryArg)
                        .font(DesktopTheme.monoSmall)
                        .foregroundStyle(DesktopTheme.textSecondary)
                        .lineLimit(1)
                    Spacer()
                    if let ms = tool.durationMs {
                        Text(String(format: "%.1fs", Double(ms) / 1000.0))
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(DesktopTheme.textMuted)
                }
            }
            .buttonStyle(.plain)

if expanded {
                VStack(alignment: .leading, spacing: 6) {
                    Text(argsPreview)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                        .textSelection(.enabled)
                    if let result = tool.resultPreview, !result.isEmpty {
                        Text(result)
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(tool.status == .failed ? DesktopTheme.danger : DesktopTheme.textSecondary)
                            .textSelection(.enabled)
                    }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 6).fill(DesktopTheme.background))
            }
        }
        .padding(10)
        .background(DashedCardBackground())
        .opacity(tool.status == .running ? 0.85 : 1)
    }

    private var iconName: String {
        switch tool.displayName {
        case "read": return "doc.text"
        case "search": return "magnifyingglass"
        case "explore": return "folder"
        case "edit": return "pencil"
        case "run": return "terminal"
        default: return "wrench.and.screwdriver"
        }
    }

    private var argsPreview: String {
        tool.args.map { "\($0.key): \($0.value.stringValue ?? String(describing: $0.value.value))" }
            .sorted()
            .joined(separator: "\n")
    }
}

struct ComposerBar: View {
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @State private var draft: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    if draft.isEmpty {
                        Text("Ask to make changes, @mention files, run /commands")
                            .font(.system(size: 13))
                            .foregroundStyle(DesktopTheme.textMuted)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                    }
                    TextEditor(text: $draft)
                        .font(.system(size: 13))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 52, maxHeight: 140)
                        .focused($focused)
                }

                HStack(spacing: 8) {
                    Button {
                        // Attachments placeholder
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .frame(width: 26, height: 26)
                            .background(Circle().fill(DesktopTheme.panelElevated))
                            .overlay(Circle().stroke(DesktopTheme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .help("Attach files (coming soon)")

                    Menu {
                        ForEach(AgentMode.allCases) { mode in
                            Button {
                                Task { await conversations.setMode(mode) }
                            } label: {
                                if conversations.mode == mode {
                                    Label(mode.title, systemImage: "checkmark")
                                } else {
                                    Text(mode.title)
                                }
                            }
                        }
                    } label: {
                        chipLabel(conversations.mode.title, systemImage: conversations.mode.systemImage)
                    }
                    .menuStyle(.borderlessButton)

                    modelMenu

                    Menu {
                        ForEach(EffortLevel.allCases) { level in
                            Button {
                                session.persistEffort(level)
                            } label: {
                                if session.selectedEffort == level {
                                    Label(level.title, systemImage: "checkmark")
                                } else {
                                    Text(level.title)
                                }
                            }
                        }
                    } label: {
                        chipLabel(session.selectedEffort.title, systemImage: "gauge.with.dots.needle.33percent")
                    }
                    .menuStyle(.borderlessButton)

                    Spacer()

                    if isRunning {
                        Button {
                            agentRun.stop()
                        } label: {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(DesktopTheme.danger))
                        }
                        .buttonStyle(.plain)
                        .help("Stop agent")
                    } else {
                        Button {
                            send()
                        } label: {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.black)
                                .frame(width: 30, height: 30)
                                .background(Circle().fill(canSend ? DesktopTheme.accent : DesktopTheme.textMuted.opacity(0.45)))
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend)
                        .keyboardShortcut(.return, modifiers: [.command])
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(DesktopTheme.panel)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(DesktopTheme.borderStrong, lineWidth: 1)
                    )
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
            .padding(.top, 8)
        }
        .background(DesktopTheme.background)
        .onReceive(NotificationCenter.default.publisher(for: .focusComposer)) { _ in
            focused = true
        }
        .onAppear { focused = true }
    }

    /// Hierarchical picker matching CLI: Supercode Cloud + BYOK provider groups.
    private var modelMenu: some View {
        Menu {
Section(ModelCatalog.SectionKind.cloud.title) {
                ForEach(ModelCatalog.cloudModels, id: \.menuId) { entry in
                    modelButton(entry)
                }
            }

            Section(ModelCatalog.SectionKind.byok.title) {
                ForEach(ModelCatalog.byokProviders) { provider in
                    Menu(provider.label) {
                        ForEach(ModelCatalog.models(for: provider), id: \.menuId) { entry in
                            modelButton(entry)
                        }
                    }
                }
            }
        } label: {
            chipLabel(session.modelChipLabel, systemImage: "cpu")
        }
        .menuStyle(.borderlessButton)
        .help("Provider · model (CLI-aligned catalog)")
    }

    @ViewBuilder
    private func modelButton(_ entry: ModelCatalog.ModelEntry) -> some View {
        let isCurrent = session.selectedProvider == entry.provider.rawValue
            && session.selectedModel == entry.id
        Button {
            session.selectModel(entry)
        } label: {
            if isCurrent {
                Label(modelMenuTitle(entry), systemImage: "checkmark")
            } else {
                Text(modelMenuTitle(entry))
            }
        }
    }

    private func modelMenuTitle(_ entry: ModelCatalog.ModelEntry) -> String {
        let sub = entry.subtitle
        if sub.isEmpty { return entry.label }
        return "\(entry.label)  ·  \(sub)"
    }

    private func chipLabel(_ title: String, systemImage: String?) -> some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: 9, weight: .bold))
            }
            Text(title)
                .lineLimit(1)
            Image(systemName: "chevron.up.chevron.down")
                .font(.system(size: 8, weight: .bold))
        }
        .font(DesktopTheme.monoTiny)
        .padding(.horizontal, 9)
        .padding(.vertical, 6)
        .background(Capsule().fill(DesktopTheme.panelElevated))
        .overlay(Capsule().stroke(DesktopTheme.border, lineWidth: 1))
        .foregroundStyle(DesktopTheme.textSecondary)
    }

    private var isRunning: Bool {
        switch agentRun.status {
        case .idle, .error: return false
        default: return true
        }
    }

    private var canSend: Bool {
        let hasText = !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return hasText && !isRunning
    }

    private func send() {
        let text = draft
        draft = ""
        agentRun.send(prompt: text)
    }
}

struct DiffInspectorView: View {
    @EnvironmentObject private var agentRun: AgentRunStore
    var embedded: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            if !embedded {
                HStack {
                    Text("Inspector")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Spacer()
                    if let selected = agentRun.diffs.first(where: { $0.id == agentRun.selectedDiffId }) {
                        Text("+\(selected.additions)  -\(selected.deletions)")
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                Divider().overlay(DesktopTheme.border)
            }

            if agentRun.diffs.isEmpty {
                VStack(spacing: 8) {
                    Spacer()
                    Image(systemName: "doc.badge.gearshape")
                        .font(.system(size: 22))
                        .foregroundStyle(DesktopTheme.textMuted)
                    Text("No pending changes")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textSecondary)
                    Text("Diffs from edit/write tools appear here")
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                    Spacer()
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(agentRun.diffs) { file in
                            Button {
                                agentRun.selectedDiffId = file.id
                            } label: {
                                Text(URL(fileURLWithPath: file.path).lastPathComponent)
                                    .font(DesktopTheme.monoTiny)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(
                                        RoundedRectangle(cornerRadius: 6)
                                            .fill(agentRun.selectedDiffId == file.id
                                                  ? DesktopTheme.panelElevated
                                                  : DesktopTheme.background)
                                    )
                                    .foregroundStyle(DesktopTheme.textSecondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                }

                Divider().overlay(DesktopTheme.border)

                if let file = agentRun.diffs.first(where: { $0.id == agentRun.selectedDiffId }) ?? agentRun.diffs.first {
                    HStack {
                        Text(file.path)
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .lineLimit(1)
                        Spacer()
if file.isAccepted == false {
                            Text("Reverted")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(DesktopTheme.textMuted)
                        } else {
                            Button("Revert") { agentRun.rejectDiff(file.id) }
                                .buttonStyle(.plain)
                                .foregroundStyle(DesktopTheme.danger)
                                .font(.system(size: 11, weight: .semibold))
                            Button("Keep") { agentRun.acceptDiff(file.id) }
                                .buttonStyle(.plain)
                                .foregroundStyle(DesktopTheme.success)
                                .font(.system(size: 11, weight: .semibold))
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)

                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(file.hunks) { hunk in
                                Text(hunk.header)
                                    .font(DesktopTheme.monoTiny)
                                    .foregroundStyle(DesktopTheme.textMuted)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                ForEach(hunk.lines) { line in
                                    HStack(alignment: .top, spacing: 0) {
                                        Text(prefix(for: line.kind))
                                            .font(DesktopTheme.monoSmall)
                                            .foregroundStyle(DesktopTheme.textMuted)
                                            .frame(width: 14, alignment: .center)
                                        Text(line.text)
                                            .font(DesktopTheme.monoSmall)
                                            .foregroundStyle(DesktopTheme.textPrimary)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 1)
                                    .background(background(for: line.kind))
                                }
                            }
                        }
                        .padding(.bottom, 12)
                    }

                    if let accepted = file.isAccepted {
                        Text(accepted ? "Accepted (apply-to-disk in Phase 3)" : "Rejected")
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(accepted ? DesktopTheme.success : DesktopTheme.danger)
                            .padding(10)
                    }
                }
            }
        }
        .background(embedded ? Color.clear : DesktopTheme.panel)
    }

    private func prefix(for kind: DiffLine.Kind) -> String {
        switch kind {
        case .add: return "+"
        case .remove: return "-"
        case .context: return " "
        }
    }

    private func background(for kind: DiffLine.Kind) -> Color {
        switch kind {
        case .add: return DesktopTheme.add
        case .remove: return DesktopTheme.remove
        case .context: return .clear
        }
    }
}

struct AgentTodoBanner: View {
    let todos: [AgentTodoItem]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Tasks")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
            ForEach(todos) { todo in
                HStack(spacing: 8) {
                    Image(systemName: icon(for: todo.status))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(color(for: todo.status))
                    Text(todo.title)
                        .font(.system(size: 12))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .strikethrough(todo.status == "done")
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(DesktopTheme.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(DesktopTheme.border, lineWidth: 1)
                )
        )
    }

    private func icon(for status: String) -> String {
        switch status {
        case "done": return "checkmark.circle.fill"
        case "in_progress": return "circle.dotted"
        default: return "circle"
        }
    }

    private func color(for status: String) -> Color {
        switch status {
        case "done": return DesktopTheme.success
        case "in_progress": return DesktopTheme.accent
        default: return DesktopTheme.textMuted
        }
    }
}

struct PermissionPromptOverlay: View {
    let request: PermissionRequest
    @EnvironmentObject private var permissions: PermissionManager

    var body: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Image(systemName: request.isDangerous ? "exclamationmark.triangle.fill" : "shield.lefthalf.filled")
                        .foregroundStyle(request.isDangerous ? DesktopTheme.danger : DesktopTheme.accent)
                    Text("Permission required")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Spacer()
                    Text(request.toolName)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                }

                Text(request.summary)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(DesktopTheme.textPrimary)

                ScrollView {
                    Text(request.detail)
                        .font(DesktopTheme.monoSmall)
                        .foregroundStyle(DesktopTheme.textSecondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 220)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 8).fill(DesktopTheme.background))

                HStack(spacing: 10) {
                    Button("Deny") {
                        permissions.resolve(.deny)
                    }
                    .keyboardShortcut(.escape, modifiers: [])
                    .buttonStyle(.plain)
                    .foregroundStyle(DesktopTheme.danger)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().stroke(DesktopTheme.danger.opacity(0.5), lineWidth: 1))

                    Spacer()

                    Button("Always allow") {
                        permissions.resolve(.always)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(DesktopTheme.panelElevated))

                    Button("Allow once") {
                        permissions.resolve(.once)
                    }
                    .keyboardShortcut(.return, modifiers: [])
                    .buttonStyle(.plain)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Capsule().fill(DesktopTheme.accent))
                }
            }
            .padding(20)
            .frame(width: 520)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(DesktopTheme.panel)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(DesktopTheme.borderStrong, lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.45), radius: 24, y: 10)
            )
        }
    }
}

struct AuthView: View {
    @EnvironmentObject private var session: AppSessionStore

    var body: some View {
        ZStack {
            DesktopTheme.background.ignoresSafeArea()
            VStack(spacing: 20) {
                VStack(spacing: 10) {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 140, height: 78)

                    Text("SUPERCODE")
                        .font(DesktopTheme.monoTiny)
                        .tracking(3)
                        .foregroundStyle(DesktopTheme.accent)
                    Text("Desktop Coding Agent")
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Text("Independent of Jarvis. Sign in with your Supercode account to start.")
                        .font(.system(size: 13))
                        .foregroundStyle(DesktopTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 420)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Server URL")
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                    TextField("https://…", text: Binding(
                        get: { session.serverURL },
                        set: { session.updateServerURL($0) }
                    ))
                    .textFieldStyle(.plain)
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 8).fill(DesktopTheme.panel))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(DesktopTheme.border, lineWidth: 1))
                    .font(DesktopTheme.monoSmall)
                }
                .frame(width: 420)

                if let code = session.deviceUserCode {
                    VStack(spacing: 8) {
                        Text("Verification code")
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                        Text(code)
                            .font(.system(size: 28, weight: .bold, design: .monospaced))
                            .foregroundStyle(DesktopTheme.accent)
                        Text("Complete authorization in your browser. This window will continue automatically.")
                            .font(.system(size: 12))
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .multilineTextAlignment(.center)
                        if session.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                                .padding(.top, 4)
                        }
                        Button("Cancel") { session.cancelLogin() }
                            .buttonStyle(.plain)
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
                    .padding(20)
                    .background(DashedCardBackground())
                    .frame(width: 420)
                } else {
                    VStack(spacing: 10) {
                        Button {
                            session.startLogin()
                        } label: {
                            Text(session.isAuthenticating ? "Starting…" : "Sign in with browser")
                                .font(.system(size: 13, weight: .semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(RoundedRectangle(cornerRadius: 10).fill(DesktopTheme.accent))
                                .foregroundStyle(.black)
                        }
                        .buttonStyle(.plain)
                        .disabled(session.isAuthenticating)
                        .frame(width: 420)

                        Button("Import token from CLI (~/.better-auth)") {
                            session.importTokenFromCLIIfAvailable()
                        }
                        .buttonStyle(.plain)
                        .font(.system(size: 12))
                        .foregroundStyle(DesktopTheme.textSecondary)
                    }
                }

                if let error = session.authError {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(DesktopTheme.danger)
                        .frame(maxWidth: 420)
                }

                Text("Jarvis is a separate product and is not required.")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
            }
            .padding(40)
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var session: AppSessionStore
    @EnvironmentObject private var workspace: WorkspaceStore

    var body: some View {
        Form {
Section("Server") {
                TextField("Server URL", text: Binding(
                    get: { session.serverURL },
                    set: { session.updateServerURL($0) }
                ))
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
                Text(session.modelChipLabel)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
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
                Text("Write, edit, and shell tools prompt for approval. Read-only git/shell commands are auto-allowed.")
                    .foregroundStyle(.secondary)
                Button("Clear always-allow list") {
                    PermissionManager.shared.clearAlwaysAllows()
                }
            }
            Section("Independence") {
                Text("Supercode Desktop does not require Jarvis. Optional coexistence is not enabled in v1.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 480, height: 480)
    }
}
