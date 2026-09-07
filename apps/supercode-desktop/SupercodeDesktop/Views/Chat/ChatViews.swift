import AppKit
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

if let alert = agentRun.activeAlert {
                    AlertCard(
                        title: alert.title,
                        message: alert.message,
                        tone: alert.tone,
                        primaryActionTitle: {
                            switch alert {
                            case .lowCredits, .planLimit: return "Upgrade"
                            case .streamError: return "Dismiss"
                            case .info: return nil
                            }
                        }(),
                        primaryAction: {
                            switch alert {
                            case .lowCredits, .planLimit:
                                if let url = URL(string: "https://supercode.ai/pricing") {
                                    NSWorkspace.shared.open(url)
                                }
                            case .streamError:
                                agentRun.dismissAlert()
                                agentRun.lastError = nil
                            case .info:
                                break
                            }
                        },
                        secondaryActionTitle: {
                            switch alert {
                            case .lowCredits, .planLimit: return "Dismiss"
                            default: return nil
                            }
                        }(),
                        secondaryAction: {
                            agentRun.dismissAlert()
                            agentRun.lastError = nil
                        },
                        onDismiss: {
                            agentRun.dismissAlert()
                            agentRun.lastError = nil
                        }
                    )
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
                .frame(width: 220, height: 124)
                .shadow(color: DesktopTheme.accent.opacity(0.22), radius: 18, y: 4)
                .accessibilityLabel("Supercode logo")

            Text("Supercode Agent")
                .font(.system(size: 22, weight: .semibold))
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
    @EnvironmentObject private var conversations: ConversationStore
    @EnvironmentObject private var agentRun: AgentRunStore
    @State private var isHovered = false

    private var isLastUser: Bool {
        message.role == .user && conversations.messages.last(where: { $0.role == .user })?.id == message.id
    }

    private var copyableText: String {
        if !message.content.isEmpty { return message.content }
        return message.parts.compactMap { part -> String? in
            switch part {
            case .text(_, let c): return c.isEmpty ? nil : c
            case .reasoning(_, let c): return c.isEmpty ? nil : c
            case .toolCall: return nil
            }
        }.joined(separator: "\n\n")
    }

    var body: some View {
        switch message.role {
        case .user:
            HStack(alignment: .bottom, spacing: 8) {
                Spacer(minLength: 60)
                if isHovered || isLastUser {
                    messageActions(isUser: true)
                }
                Text(message.content)
                    .font(.system(size: 13))
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .textSelection(.enabled)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(DesktopTheme.userBubble)
                    )
            }
            .onHover { isHovered = $0 }
        case .assistant:
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 8) {
                    assistantBody
                    if isHovered && !copyableText.isEmpty {
                        messageActions(isUser: false)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, 24)
            .onHover { isHovered = $0 }
        default:
            Text(message.content)
                .font(DesktopTheme.monoSmall)
                .foregroundStyle(DesktopTheme.textMuted)
        }
    }

    @ViewBuilder
    private var assistantBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            if message.parts.isEmpty {
                if message.content.isEmpty {
                    streamingPlaceholder
                } else {
                    resultSection(message.content)
                }
            } else {
                let reasoningParts = message.parts.compactMap { part -> String? in
                    if case .reasoning(_, let c) = part, !c.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        return c
                    }
                    return nil
                }
                let toolParts = message.parts.compactMap { part -> ToolCallPart? in
                    if case .toolCall(let t) = part { return t }
                    return nil
                }
                let textParts = message.parts.compactMap { part -> String? in
                    if case .text(_, let c) = part, !c.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        return c
                    }
                    return nil
                }

                // Process surface — thinking + tools under one disclosure
                if !reasoningParts.isEmpty || !toolParts.isEmpty {
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(reasoningParts.enumerated()), id: \.offset) { _, content in
                                Text(content)
                                    .font(DesktopTheme.monoSmall)
                                    .foregroundStyle(DesktopTheme.textMuted)
                                    .textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            ForEach(toolParts) { tool in
                                ToolCallCard(tool: tool)
                            }
                        }
                        .padding(.top, 4)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "brain.head.profile")
                                .font(.system(size: 11, weight: .semibold))
                            Text(thinkingLabel(reasoningCount: reasoningParts.count, toolCount: toolParts.count))
                                .font(DesktopTheme.monoTiny)
                        }
                        .foregroundStyle(DesktopTheme.textMuted)
                    }
                }

                // Result surface — final answer only
                if textParts.isEmpty && reasoningParts.isEmpty && toolParts.isEmpty {
                    streamingPlaceholder
                } else if !textParts.isEmpty {
                    resultSection(textParts.joined(separator: "\n\n"))
                } else if message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                            && reasoningParts.isEmpty {
                    // Fallback legacy content field
                    resultSection(message.content)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func thinkingLabel(reasoningCount: Int, toolCount: Int) -> String {
        var bits: [String] = ["Thinking"]
        if toolCount > 0 {
            bits.append("\(toolCount) tool\(toolCount == 1 ? "" : "s")")
        }
        if reasoningCount > 1 {
            bits.append("\(reasoningCount) notes")
        }
        return bits.joined(separator: " · ")
    }

    @ViewBuilder
    private func resultSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "text.alignleft")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(DesktopTheme.success)
                Text("Result")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.success)
                Rectangle()
                    .fill(DesktopTheme.border)
                    .frame(height: 1)
            }
            MarkdownResultView(text: text)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(DesktopTheme.panelElevated.opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(DesktopTheme.border, lineWidth: 1)
                )
        )
    }

    private func messageActions(isUser: Bool) -> some View {
        HStack(spacing: 4) {
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(copyableText, forType: .string)
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(DesktopTheme.textMuted)
                    .padding(6)
                    .background(Circle().fill(DesktopTheme.panelElevated))
            }
            .buttonStyle(.plain)
            .help("Copy")

if isUser && isLastUser && (agentRun.status == .idle || agentRun.status == .error) {
                Button {
                    if let text = conversations.beginEditLastUserMessage() {
                        NotificationCenter.default.post(
                            name: .composerPrefill,
                            object: text
                        )
                        NotificationCenter.default.post(name: .focusComposer, object: nil)
                    }
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .padding(6)
                        .background(Circle().fill(DesktopTheme.panelElevated))
                }
                .buttonStyle(.plain)
                .help("Edit and resend")
                .disabled(agentRun.status != .idle && agentRun.status != .error)
            }
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

}

/// Block-aware markdown renderer for assistant Result content.
/// Uses full markdown syntax (headings, lists, code, tables) instead of
/// inline-only parsing so desktop matches the CLI Result surface.
struct MarkdownResultView: View {
    let text: String

    var body: some View {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(Self.splitBlocks(trimmed).enumerated()), id: \.offset) { _, block in
                    blockView(block)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func blockView(_ block: MarkdownBlock) -> some View {
        switch block {
        case .heading(let level, let content):
            Text(inlineAttributed(content))
                .font(headingFont(level))
                .foregroundStyle(DesktopTheme.textPrimary)
                .textSelection(.enabled)
                .padding(.top, level <= 2 ? 4 : 2)
        case .paragraph(let content):
            Text(inlineAttributed(content))
                .font(.system(size: 13.5))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineSpacing(3.5)
                .textSelection(.enabled)
        case .list(let ordered, let items):
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                    HStack(alignment: .top, spacing: 8) {
                        Text(ordered ? "\(idx + 1)." : "•")
                            .font(DesktopTheme.monoSmall)
                            .foregroundStyle(DesktopTheme.accent)
                            .frame(width: 16, alignment: .trailing)
                        Text(inlineAttributed(item))
                            .font(.system(size: 13.5))
                            .foregroundStyle(DesktopTheme.textPrimary)
                            .lineSpacing(2)
                            .textSelection(.enabled)
                    }
                }
            }
        case .code(let lang, let code):
            VStack(alignment: .leading, spacing: 0) {
                if let lang, !lang.isEmpty {
                    Text(lang)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                        .padding(.horizontal, 10)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                }
                Text(code)
                    .font(DesktopTheme.monoSmall)
                    .foregroundStyle(DesktopTheme.textPrimary)
                    .textSelection(.enabled)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(DesktopTheme.background)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(DesktopTheme.border, lineWidth: 1)
                    )
            )
        case .blockquote(let content):
            HStack(alignment: .top, spacing: 10) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(DesktopTheme.accent.opacity(0.7))
                    .frame(width: 3)
                Text(inlineAttributed(content))
                    .font(.system(size: 13, weight: .regular).italic())
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .textSelection(.enabled)
            }
            .padding(.vertical, 2)
        case .table(let headers, let rows):
            MarkdownTableView(headers: headers, rows: rows)
        case .hr:
            Rectangle()
                .fill(DesktopTheme.border)
                .frame(height: 1)
                .padding(.vertical, 4)
        case .raw(let content):
            Text(content)
                .font(.system(size: 13.5))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineSpacing(3)
                .textSelection(.enabled)
        }
    }

    private func headingFont(_ level: Int) -> Font {
        switch level {
        case 1: return .system(size: 18, weight: .bold)
        case 2: return .system(size: 16, weight: .semibold)
        case 3: return .system(size: 14.5, weight: .semibold)
        default: return .system(size: 13.5, weight: .semibold)
        }
    }

    private func inlineAttributed(_ markdown: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace
        )
        if let attributed = try? AttributedString(markdown: markdown, options: options) {
            return attributed
        }
        return AttributedString(markdown)
    }

    private enum MarkdownBlock {
        case heading(level: Int, content: String)
        case paragraph(String)
        case list(ordered: Bool, items: [String])
        case code(lang: String?, code: String)
        case blockquote(String)
        case table(headers: [String], rows: [[String]])
        case hr
        case raw(String)
    }

    private static func splitBlocks(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = source.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            if trimmed.isEmpty {
                i += 1
                continue
            }

            // Fenced code
            if trimmed.hasPrefix("```") {
                let lang = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                var codeLines: [String] = []
                i += 1
                while i < lines.count && !lines[i].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    codeLines.append(lines[i])
                    i += 1
                }
                if i < lines.count { i += 1 } // consume closing fence
                blocks.append(.code(lang: lang.isEmpty ? nil : lang, code: codeLines.joined(separator: "\n")))
                continue
            }

            // Heading
            if let heading = parseHeading(trimmed) {
                blocks.append(.heading(level: heading.0, content: heading.1))
                i += 1
                continue
            }

            // HR
            if trimmed == "---" || trimmed == "***" || trimmed == "___" {
                blocks.append(.hr)
                i += 1
                continue
            }

            // Table (header + separator)
            if i + 1 < lines.count, isTableSeparator(lines[i + 1]), trimmed.contains("|") {
                let headers = splitTableRow(trimmed)
                i += 2
                var rows: [[String]] = []
                while i < lines.count {
                    let rowTrim = lines[i].trimmingCharacters(in: .whitespaces)
                    if rowTrim.isEmpty || !rowTrim.contains("|") { break }
                    rows.append(splitTableRow(rowTrim))
                    i += 1
                }
                blocks.append(.table(headers: headers, rows: rows))
                continue
            }

            // Blockquote
            if trimmed.hasPrefix(">") {
                var quote: [String] = []
                while i < lines.count {
                    let q = lines[i].trimmingCharacters(in: .whitespaces)
                    if !q.hasPrefix(">") { break }
                    quote.append(String(q.drop(while: { $0 == ">" || $0 == " " })))
                    i += 1
                }
                blocks.append(.blockquote(quote.joined(separator: " ")))
                continue
            }

            // Lists
            if isListItem(trimmed) {
                let ordered = trimmed.range(of: #"^\d+\."#, options: .regularExpression) != nil
                var items: [String] = []
                while i < lines.count {
                    let itemLine = lines[i].trimmingCharacters(in: .whitespaces)
                    if !isListItem(itemLine) { break }
                    items.append(stripListMarker(itemLine))
                    i += 1
                }
                blocks.append(.list(ordered: ordered, items: items))
                continue
            }

            // Paragraph — gather until blank / structural
            var para: [String] = [trimmed]
            i += 1
            while i < lines.count {
                let next = lines[i]
                let nt = next.trimmingCharacters(in: .whitespaces)
                if nt.isEmpty { break }
                if nt.hasPrefix("```") || parseHeading(nt) != nil || nt.hasPrefix(">") || isListItem(nt) || nt == "---" {
                    break
                }
                if i + 1 < lines.count, isTableSeparator(lines[i + 1]), nt.contains("|") {
                    break
                }
                para.append(nt)
                i += 1
            }
            blocks.append(.paragraph(para.joined(separator: " ")))
        }
        return blocks.isEmpty ? [.raw(source)] : blocks
    }

    private static func parseHeading(_ line: String) -> (Int, String)? {
        guard line.hasPrefix("#") else { return nil }
        var level = 0
        for ch in line {
            if ch == "#" { level += 1 } else { break }
        }
        guard level >= 1 && level <= 6 else { return nil }
        let rest = line.dropFirst(level).trimmingCharacters(in: .whitespaces)
        guard !rest.isEmpty else { return nil }
        // Require space after hashes for ATX headings when more content follows
        return (level, rest)
    }

    private static func isListItem(_ line: String) -> Bool {
        line.range(of: #"^([-*+]|\d+\.)\s+"#, options: .regularExpression) != nil
    }

    private static func stripListMarker(_ line: String) -> String {
        if let range = line.range(of: #"^([-*+]|\d+\.)\s+"#, options: .regularExpression) {
            return String(line[range.upperBound...])
        }
        return line
    }

    private static func isTableSeparator(_ line: String) -> Bool {
        let t = line.trimmingCharacters(in: .whitespaces)
        guard t.contains("-") && t.contains("|") else { return false }
        return t.range(of: #"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$"#, options: .regularExpression) != nil
    }

    private static func splitTableRow(_ line: String) -> [String] {
        var s = line.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("|") { s.removeFirst() }
        if s.hasSuffix("|") { s.removeLast() }
        return s.split(separator: "|", omittingEmptySubsequences: false).map {
            $0.trimmingCharacters(in: .whitespaces)
        }
    }
}

struct MarkdownTableView: View {
    let headers: [String]
    let rows: [[String]]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(headers.enumerated()), id: \.offset) { _, h in
                    Text(h)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                }
            }
            .background(DesktopTheme.panel)

            Rectangle().fill(DesktopTheme.border).frame(height: 1)

            ForEach(Array(rows.enumerated()), id: \.offset) { idx, row in
                HStack(spacing: 0) {
                    ForEach(Array(headers.indices), id: \.self) { col in
                        let cell = col < row.count ? row[col] : ""
                        Text(cell)
                            .font(.system(size: 12))
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(8)
                    }
                }
                .background(idx % 2 == 0 ? DesktopTheme.background.opacity(0.35) : Color.clear)

                if idx < rows.count - 1 {
                    Rectangle().fill(DesktopTheme.border.opacity(0.6)).frame(height: 1)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(DesktopTheme.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
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
    @EnvironmentObject private var workspace: WorkspaceStore
    @State private var draft: String = ""
    @State private var pickerSelection: Int = 0
    @FocusState private var focused: Bool

    private enum PickerKind {
        case slash(query: String, range: Range<String.Index>)
        case mention(query: String, range: Range<String.Index>)
    }

    private var activePicker: PickerKind? {
        Self.detectPicker(in: draft)
    }

    private var slashItems: [ComposerCommands.SlashCommand] {
        guard case .slash(let query, _) = activePicker else { return [] }
        return ComposerCommands.filteredSlash(query: query)
    }

    private var mentionItems: [ComposerCommands.MentionItem] {
        guard case .mention(let query, _) = activePicker else { return [] }
        let chats = conversations.conversations.prefix(8).map(\.displayTitle)
        return ComposerCommands.mentionItems(
            query: query,
            workspacePath: workspace.path,
            fileNames: workspace.flatFileNames(),
            recentChats: Array(chats)
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            if let picker = activePicker {
                pickerPanel(for: picker)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 4)
            }

            VStack(alignment: .leading, spacing: 10) {
                ZStack(alignment: .topLeading) {
                    if draft.isEmpty {
                        Text("Ask to make changes, @mention files, run /commands")
                            .font(.system(size: 13))
                            .foregroundStyle(DesktopTheme.textMuted)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
ComposerTextEditor(
                        text: $draft,
                        isEnabled: !isRunning,
                        onSubmit: { handleSubmit() },
                        onNavigatePicker: activePicker == nil
                            ? nil
                            : { delta in navigatePicker(delta: delta) },
                        onCancelPicker: activePicker == nil
                            ? nil
                            : { dismissPickerToken() }
                    )
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
                        .help("Send (Return) · Shift+Return for newline")
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
        .onReceive(NotificationCenter.default.publisher(for: .composerPrefill)) { note in
            if let text = note.object as? String {
                draft = text
                focused = true
            }
        }
        .onChange(of: draft) { _, _ in
            pickerSelection = 0
        }
        .onAppear { focused = true }
    }

    @ViewBuilder
    private func pickerPanel(for picker: PickerKind) -> some View {
        switch picker {
        case .slash:
            ComposerPickerPanel(
                title: "Commands",
                emptyLabel: "No matching commands"
            ) {
                ForEach(Array(slashItems.enumerated()), id: \.element.id) { index, item in
                    ComposerPickerRow(
                        icon: item.systemImage,
                        title: "/" + item.title,
                        subtitle: item.subtitle,
                        selected: index == pickerSelection
                    ) {
                        applySlash(item)
                    }
                }
            }
        case .mention:
            ComposerPickerPanel(
                title: "Mention",
                emptyLabel: "No matches"
            ) {
                ForEach(Array(mentionItems.enumerated()), id: \.element.id) { index, item in
                    ComposerPickerRow(
                        icon: item.systemImage,
                        title: item.label,
                        subtitle: item.detail,
                        selected: index == pickerSelection
                    ) {
                        applyMention(item)
                    }
                }
            }
        }
    }

    private func navigatePicker(delta: Int) {
        let count: Int
        switch activePicker {
        case .slash: count = slashItems.count
        case .mention: count = mentionItems.count
        case .none: return
        }
        guard count > 0 else { return }
        pickerSelection = (pickerSelection + delta + count) % count
    }

    private func handleSubmit() {
        if let picker = activePicker {
            switch picker {
            case .slash:
                guard slashItems.indices.contains(pickerSelection) else {
                    send()
                    return
                }
                applySlash(slashItems[pickerSelection])
            case .mention:
                guard mentionItems.indices.contains(pickerSelection) else {
                    send()
                    return
                }
                applyMention(mentionItems[pickerSelection])
            }
            return
        }
        send()
    }

    private func applySlash(_ item: ComposerCommands.SlashCommand) {
        guard case .slash(_, let range) = activePicker else {
            draft = item.insertText
            if item.autoSend { send() }
            return
        }
draft.replaceSubrange(range, with: item.insertText)
        if item.autoSend {
            let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            let cmd = item.command.trimmingCharacters(in: .whitespacesAndNewlines)
            let insert = item.insertText.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed == cmd || trimmed == insert {
                send()
            }
        }
    }

    private func applyMention(_ item: ComposerCommands.MentionItem) {
        guard case .mention(_, let range) = activePicker else {
            draft = item.insertText
            return
        }
        draft.replaceSubrange(range, with: item.insertText)
    }

    private func dismissPickerToken() {
        guard let picker = activePicker else { return }
        switch picker {
        case .slash(_, let range), .mention(_, let range):
            draft.replaceSubrange(range, with: "")
        }
    }

/// Detect trailing `/cmd` or `@mention` token for popup pickers (desk6/desk7).
    private static func detectPicker(in text: String) -> PickerKind? {
        let lineStart: String.Index
        if let nl = text.lastIndex(of: "\n") {
            lineStart = text.index(after: nl)
        } else {
            lineStart = text.startIndex
        }
        let line = text[lineStart...]
        // Start of last whitespace-delimited token on the current line.
        let tokenStart: String.Index
        if let ws = line.lastIndex(where: { $0.isWhitespace }) {
            tokenStart = text.index(after: ws)
        } else {
            tokenStart = lineStart
        }
        guard tokenStart < text.endIndex else { return nil }
        let token = String(text[tokenStart...])
        guard !token.isEmpty else { return nil }
        let range = tokenStart..<text.endIndex

        if token.hasPrefix("/") {
            if token.contains(where: { $0.isWhitespace }) { return nil }
            return .slash(query: token, range: range)
        }
        if token.hasPrefix("@") {
            if token.dropFirst().contains(where: { $0.isWhitespace }) { return nil }
            return .mention(query: token, range: range)
        }
        return nil
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
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isRunning else { return }
        draft = ""
        agentRun.send(prompt: text)
    }
}

/// NSTextView wrapper: Return sends, Shift+Return inserts a newline.
/// Arrow keys navigate slash/@ pickers when a callback is provided.
struct ComposerTextEditor: NSViewRepresentable {
    @Binding var text: String
    var isEnabled: Bool
    var onSubmit: () -> Void
    var onNavigatePicker: ((Int) -> Void)? = nil
    var onCancelPicker: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = false
        scroll.autohidesScrollers = true
        scroll.borderType = .noBorder
        scroll.drawsBackground = false

        let textView = ComposerNSTextView()
        textView.delegate = context.coordinator
        textView.drawsBackground = false
        textView.backgroundColor = .clear
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.font = NSFont.systemFont(ofSize: 13)
        textView.textColor = NSColor(DesktopTheme.textPrimary)
        textView.insertionPointColor = NSColor(DesktopTheme.accent)
        textView.textContainerInset = NSSize(width: 2, height: 6)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(
            width: 0,
            height: CGFloat.greatestFiniteMagnitude
        )
        let coordinator = context.coordinator
        textView.onSubmit = { [weak coordinator] in
            coordinator?.parent.onSubmit()
        }
        textView.onNavigatePicker = { [weak coordinator] delta in
            coordinator?.parent.onNavigatePicker?(delta)
        }
        textView.onCancelPicker = { [weak coordinator] in
            coordinator?.parent.onCancelPicker?()
        }

        scroll.documentView = textView
        coordinator.textView = textView
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        guard let textView = coordinator.textView else { return }
        textView.onSubmit = { [weak coordinator] in
            coordinator?.parent.onSubmit()
        }
        textView.onNavigatePicker = { [weak coordinator] delta in
            coordinator?.parent.onNavigatePicker?(delta)
        }
        textView.onCancelPicker = { [weak coordinator] in
            coordinator?.parent.onCancelPicker?()
        }
        textView.isEditable = isEnabled
        textView.isSelectable = true
        if textView.string != text {
            textView.string = text
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ComposerTextEditor
        weak var textView: ComposerNSTextView?

        init(_ parent: ComposerTextEditor) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
        }
    }
}

final class ComposerNSTextView: NSTextView {
    var onSubmit: (() -> Void)?
    var onNavigatePicker: ((Int) -> Void)?
    var onCancelPicker: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        let isReturn =
            event.keyCode == 36 /* Return */
            || event.keyCode == 76 /* Keypad Enter */
            || event.charactersIgnoringModifiers == "\r"
            || event.charactersIgnoringModifiers == "\n"

        if isReturn {
            let shift = event.modifierFlags.contains(.shift)
            let option = event.modifierFlags.contains(.option)
            if shift || option {
                insertText("\n", replacementRange: selectedRange())
                return
            }
            onSubmit?()
            return
        }

        // Up / Down for picker navigation when handler is set
        if event.keyCode == 126 /* up */ {
            if onNavigatePicker != nil {
                onNavigatePicker?(-1)
                return
            }
        }
        if event.keyCode == 125 /* down */ {
            if onNavigatePicker != nil {
                onNavigatePicker?(1)
                return
            }
        }
        if event.keyCode == 53 /* escape */ {
            if onCancelPicker != nil {
                onCancelPicker?()
                return
            }
        }

        super.keyDown(with: event)
    }
}

struct ComposerPickerPanel<Content: View>: View {
    let title: String
    let emptyLabel: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
                .padding(.horizontal, 10)
                .padding(.top, 8)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    content()
                }
                .padding(.horizontal, 6)
                .padding(.bottom, 8)
            }
            .frame(maxHeight: 220)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(DesktopTheme.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(DesktopTheme.borderStrong, lineWidth: 1)
                )
        )
    }
}

struct ComposerPickerRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(selected ? DesktopTheme.accent : DesktopTheme.textSecondary)
                    .frame(width: 18)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(selected ? DesktopTheme.accentSoft : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                        .frame(width: 260, height: 146)
                        .shadow(color: DesktopTheme.accent.opacity(0.28), radius: 22, y: 6)

                    Text("SUPERCODE")
                        .font(DesktopTheme.monoTiny)
                        .tracking(3)
                        .foregroundStyle(DesktopTheme.accent)
                    Text("Desktop Coding Agent")
                        .font(.system(size: 30, weight: .semibold))
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

                    HStack(spacing: 8) {
                        Button("Local") { session.useLocalServer() }
                            .buttonStyle(.plain)
                            .font(DesktopTheme.monoTiny)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(
                                    session.serverURL == ServerConfig.localURL
                                    ? DesktopTheme.accent.opacity(0.25)
                                    : DesktopTheme.panelElevated
                                )
                            )
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .help(ServerConfig.localURL)

                        Button("Production") { session.useProductionServer() }
                            .buttonStyle(.plain)
                            .font(DesktopTheme.monoTiny)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(
                                    session.serverURL == ServerConfig.productionURL
                                    ? DesktopTheme.accent.opacity(0.25)
                                    : DesktopTheme.panelElevated
                                )
                            )
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .help(ServerConfig.productionURL)

                        Spacer()

                        Text(ServerConfig.buildDefaultLabel)
                            .font(DesktopTheme.monoTiny)
                            .foregroundStyle(DesktopTheme.textMuted)
                    }
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
