import AppKit
import SwiftUI

struct ReviewWorkspaceView: View {
    @EnvironmentObject private var reviewStore: ReviewStore

    var body: some View {
        HStack(spacing: 0) {
            ReviewFileTreePane()
                .frame(width: 300)
            Divider().overlay(DesktopTheme.border)
            ReviewDetailPane()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(DesktopTheme.background)
        .task {
            if reviewStore.reviews.isEmpty {
                await reviewStore.refreshList()
            }
        }
    }
}

private struct ReviewFileTreePane: View {
    @EnvironmentObject private var reviewStore: ReviewStore
    @State private var expandedFolders = Set<String>()

    var body: some View {
        VStack(spacing: 0) {
            ReviewSelectorHeader()
            Divider().overlay(DesktopTheme.border)
            if reviewStore.isLoadingDetail && reviewStore.files.isEmpty {
                Spacer()
                ProgressView().controlSize(.small).tint(DesktopTheme.accent)
                Text("Loading changed files…")
                    .font(.caption)
                    .foregroundStyle(DesktopTheme.textMuted)
                    .padding(.top, 8)
                Spacer()
            } else if reviewStore.selectedReviewID == nil {
                ContentUnavailableView("No pull requests", systemImage: "arrow.triangle.pull")
                    .foregroundStyle(DesktopTheme.textSecondary)
            } else if reviewStore.files.isEmpty {
                ContentUnavailableView("No changed files", systemImage: "doc.text.magnifyingglass")
                    .foregroundStyle(DesktopTheme.textSecondary)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(FileTreeBuilder.build(reviewStore.files)) { node in
                            ReviewFileTreeNodeRow(
                                node: node,
                                depth: 0,
                                expandedFolders: $expandedFolders
                            )
                        }
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .background(DesktopTheme.panel)
        .onChange(of: reviewStore.selectedReviewID) {
            expandedFolders = Set(FileTreeBuilder.folderPaths(reviewStore.files))
        }
        .onChange(of: reviewStore.files) {
            expandedFolders = Set(FileTreeBuilder.folderPaths(reviewStore.files))
        }
    }
}

private struct ReviewSelectorHeader: View {
    @EnvironmentObject private var reviewStore: ReviewStore

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Changed files")
                    .font(.headline)
                    .foregroundStyle(DesktopTheme.textPrimary)
                Spacer()
                Button("Refresh", systemImage: "arrow.clockwise", action: refresh)
                    .labelStyle(.iconOnly)
                    .buttonStyle(.plain)
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .disabled(reviewStore.isLoadingList)
                    .help("Refresh pull requests")
            }

            Menu {
                ForEach(reviewStore.reviews) { review in
                    Button(action: { select(review) }) {
                        Text("\(review.repository.fullName) #\(review.prNumber) — \(review.prTitle)")
                    }
                }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "arrow.triangle.pull")
                        .foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(selectedReview?.repository.fullName ?? "Select a pull request")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(DesktopTheme.textPrimary)
                        if let review = selectedReview {
                            Text("#\(review.prNumber) \(review.prTitle)")
                                .font(.caption2)
                                .foregroundStyle(DesktopTheme.textMuted)
                                .lineLimit(1)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2)
                        .foregroundStyle(DesktopTheme.textMuted)
                }
                .padding(.horizontal, 9)
                .frame(height: 40)
                .background(RoundedRectangle(cornerRadius: 7).fill(DesktopTheme.panelElevated))
                .overlay(RoundedRectangle(cornerRadius: 7).stroke(DesktopTheme.border))
            }
            .menuStyle(.borderlessButton)
            .disabled(reviewStore.reviews.isEmpty)
        }
        .padding(12)
    }

    private var selectedReview: PullRequestReviewSummary? {
        reviewStore.reviews.first { $0.id == reviewStore.selectedReviewID }
    }

    private func refresh() {
        Task { await reviewStore.refreshList() }
    }

    private func select(_ review: PullRequestReviewSummary) {
        Task { await reviewStore.select(review) }
    }
}

private struct ReviewFileTreeNodeRow: View {
    @EnvironmentObject private var reviewStore: ReviewStore
    let node: ReviewFileTreeNode
    let depth: Int
    @Binding var expandedFolders: Set<String>

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Button(action: activate) {
                HStack(spacing: 6) {
                    Image(systemName: node.file == nil ? folderSymbol : "doc.text")
                        .font(.caption)
                        .foregroundStyle(node.file == nil ? DesktopTheme.textMuted : statusColor)
                        .frame(width: 14)
                    Text(node.name)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if let file = node.file {
                        Text("+\(file.additions)").foregroundStyle(.green)
                        Text("−\(file.deletions)").foregroundStyle(.red)
                    }
                }
                .font(DesktopTheme.monoTiny)
                .padding(.leading, CGFloat(depth * 15 + 10))
                .padding(.trailing, 10)
                .frame(height: 27)
                .background(
                    RoundedRectangle(cornerRadius: 5)
                        .fill(reviewStore.selectedFilename == node.path ? DesktopTheme.panelElevated : .clear)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibilityLabel)

            if node.file == nil && expandedFolders.contains(node.path) {
                ForEach(node.children) { child in
                    ReviewFileTreeNodeRow(
                        node: child,
                        depth: depth + 1,
                        expandedFolders: $expandedFolders
                    )
                }
            }
        }
        .padding(.horizontal, 5)
    }

    private var folderSymbol: String {
        expandedFolders.contains(node.path) ? "folder.fill.badge.minus" : "folder.fill.badge.plus"
    }

    private var statusColor: Color {
        switch node.file?.status {
        case "added": return .green
        case "removed": return .red
        case "renamed": return .orange
        default: return DesktopTheme.textSecondary
        }
    }

    private var accessibilityLabel: String {
        guard let file = node.file else { return "\(node.name) folder" }
        return "\(node.name), \(file.status), \(file.additions) additions, \(file.deletions) deletions"
    }

    private func activate() {
        if node.file != nil {
            reviewStore.selectFile(node.path)
        } else if expandedFolders.contains(node.path) {
            expandedFolders.remove(node.path)
        } else {
            expandedFolders.insert(node.path)
        }
    }
}

private struct ReviewDetailPane: View {
    @EnvironmentObject private var reviewStore: ReviewStore

    var body: some View {
        Group {
            if reviewStore.selectedReviewID == nil {
                ContentUnavailableView("Select a review", systemImage: "arrow.triangle.pull")
                    .foregroundStyle(DesktopTheme.textSecondary)
            } else if reviewStore.isLoadingDetail && reviewStore.detail == nil {
                ProgressView("Loading review…").tint(DesktopTheme.accent)
            } else if let detail = reviewStore.detail {
                VStack(spacing: 0) {
                    ReviewDetailHeader(detail: detail)
                    Divider().overlay(DesktopTheme.border)
                    ReviewTabBar()
                    Divider().overlay(DesktopTheme.border)
                    if reviewStore.selectedTab == .overview {
                        ReviewOverview(detail: detail)
                    } else {
                        ReviewDiffView(files: reviewStore.files)
                    }
                }
            }
        }
        .overlay(alignment: .bottom) {
            if let error = reviewStore.errorMessage {
                Text(error)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 8).fill(DesktopTheme.danger))
                    .padding(12)
            }
        }
    }
}

private struct ReviewDetailHeader: View {
    @EnvironmentObject private var reviewStore: ReviewStore
    let detail: PullRequestReviewDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                PrStateBadge(state: detail.prState)
                Text("\(detail.repository.fullName) #\(detail.prNumber)")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
                Spacer()
                Button("Open on GitHub", systemImage: "arrow.up.right.square", action: openOnGitHub)
                    .buttonStyle(.plain)
                    .foregroundStyle(DesktopTheme.textSecondary)
                if detail.status != .completed {
                    Button(detail.status == .failed ? "Retry review" : "Run review", systemImage: "sparkles", action: triggerReview)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(reviewStore.isTriggering || detail.status == .pending)
                }
            }
            Text(detail.prTitle)
                .font(.title2.weight(.semibold))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineLimit(2)
            HStack(spacing: 7) {
                if let author = detail.authorName ?? detail.author {
                    Text(author).fontWeight(.semibold)
                    Text("opened this pull request")
                }
                if let head = detail.headRef, let base = detail.baseRef {
                    Label(head, systemImage: "arrow.triangle.branch")
                    Image(systemName: "arrow.right")
                    Text(base)
                }
                Spacer()
                Text("+\(detail.additions ?? 0)").foregroundStyle(.green)
                Text("−\(detail.deletions ?? 0)").foregroundStyle(.red)
                Text("\(detail.changedFiles ?? 0) files")
            }
            .font(DesktopTheme.monoTiny)
            .foregroundStyle(DesktopTheme.textMuted)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(DesktopTheme.panel)
    }

    private func openOnGitHub() {
        guard let url = URL(string: detail.prUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    private func triggerReview() {
        Task { await reviewStore.triggerReview() }
    }
}

private struct PrStateBadge: View {
    let state: PullRequestState?

    var body: some View {
        Label(title, systemImage: symbol)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private var title: String {
        switch state {
        case .merged: return "Merged"
        case .closed: return "Closed"
        default: return "Open"
        }
    }

    private var symbol: String {
        state == .merged ? "arrow.triangle.merge" : "arrow.triangle.pull"
    }

    private var color: Color {
        switch state {
        case .merged: return .purple
        case .closed: return .red
        default: return .green
        }
    }
}

private struct ReviewTabBar: View {
    @EnvironmentObject private var reviewStore: ReviewStore

    var body: some View {
        HStack(spacing: 22) {
            ForEach(ReviewStore.ReviewTab.allCases) { tab in
                Button(action: { reviewStore.selectedTab = tab }) {
                    VStack(spacing: 7) {
                        HStack(spacing: 6) {
                            Image(systemName: tab == .overview ? "text.alignleft" : "doc.text")
                            Text(tab.rawValue)
                            if tab == .diff {
                                Text("\(reviewStore.files.count)")
                                    .font(.caption2.weight(.semibold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(DesktopTheme.panelElevated))
                            }
                        }
                        Rectangle()
                            .fill(reviewStore.selectedTab == tab ? DesktopTheme.accent : .clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(reviewStore.selectedTab == tab ? DesktopTheme.textPrimary : DesktopTheme.textMuted)
            }
            Spacer()
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .background(DesktopTheme.panel)
    }
}

private struct ReviewOverview: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ReviewOverviewSectionTabs(detail: detail)
                    ReviewAnalysisDisclosure(detail: detail)
                    ReviewDescriptionSection(detail: detail)
                    ReviewResultCard(detail: detail)
                }
                .padding(.horizontal, 30)
                .padding(.vertical, 24)
                .frame(maxWidth: 760, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }

            Divider().overlay(DesktopTheme.border)

            ReviewOverviewInfoRail(detail: detail)
                .frame(width: 250)
        }
    }
}

private struct ReviewOverviewSectionTabs: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        HStack(spacing: 8) {
            Text("Description")
                .foregroundStyle(DesktopTheme.textPrimary)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(Capsule().fill(DesktopTheme.panelElevated))
            Text("Supercode review")
                .foregroundStyle(DesktopTheme.textMuted)
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
            Spacer()
            Text("\(detail.changedFiles ?? 0) files")
                .foregroundStyle(DesktopTheme.textMuted)
        }
        .font(.caption.weight(.medium))
    }
}

private struct ReviewAnalysisDisclosure: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: "sparkles")
                .foregroundStyle(DesktopTheme.accent)
            Text("Supercode analysis")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(DesktopTheme.textSecondary)
            Spacer()
            Label(detail.status.title, systemImage: detail.status.symbol)
                .font(.caption.weight(.semibold))
                .foregroundStyle(DesktopTheme.textMuted)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(DesktopTheme.textMuted)
        }
        .padding(.horizontal, 14)
        .frame(height: 42)
        .background(RoundedRectangle(cornerRadius: 8).fill(DesktopTheme.panelElevated))
    }
}

private struct ReviewDescriptionSection: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("Description")
                .font(.title3.weight(.semibold))
                .foregroundStyle(DesktopTheme.textPrimary)
            MarkdownDocumentView(content: description)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var description: String {
        let body = detail.body?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return body.isEmpty ? "No description provided." : body
    }
}

private struct ReviewOverviewInfoRail: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ReviewRailSection(title: "Review") {
                    Label(detail.status.title, systemImage: detail.status.symbol)
                        .foregroundStyle(statusColor)
                    Text(detail.summary ?? "Supercode review status for this pull request.")
                        .foregroundStyle(DesktopTheme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ReviewRailSection(title: "Changes") {
                    HStack(spacing: 12) {
                        Text("+\(detail.additions ?? 0)").foregroundStyle(.green)
                        Text("−\(detail.deletions ?? 0)").foregroundStyle(.red)
                    }
                    Label("\(detail.changedFiles ?? 0) changed files", systemImage: "doc.on.doc")
                        .foregroundStyle(DesktopTheme.textSecondary)
                }
                ReviewRailSection(title: "Branches") {
                    Label(detail.headRef ?? "Head", systemImage: "arrow.triangle.branch")
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.turn.down.right")
                        Text(detail.baseRef ?? "Base")
                    }
                    .foregroundStyle(DesktopTheme.textMuted)
                }
                ReviewRailSection(title: "Repository") {
                    Text(detail.repository.fullName)
                        .foregroundStyle(DesktopTheme.textSecondary)
                    Text("Updated \(detail.updatedAt, style: .relative)")
                        .foregroundStyle(DesktopTheme.textMuted)
                }
            }
        }
        .background(DesktopTheme.panel)
    }

    private var statusColor: Color {
        switch detail.status {
        case .completed: return .green
        case .pending: return .orange
        case .failed: return DesktopTheme.danger
        default: return DesktopTheme.textMuted
        }
    }
}

private struct ReviewRailSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(DesktopTheme.textMuted)
            VStack(alignment: .leading, spacing: 8) {
                content
            }
            .font(.caption)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Rectangle().fill(DesktopTheme.border).frame(height: 1)
        }
    }
}

private struct ReviewResultCard: View {
    let detail: PullRequestReviewDetail

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "s.square.fill")
                    .font(.caption)
                    .foregroundStyle(DesktopTheme.textSecondary)
                Text("SUPERcode review")
                    .font(.caption2.weight(.bold))
                    .tracking(1.6)
                    .textCase(.uppercase)
                Spacer()
                Label(detail.status.title, systemImage: detail.status.symbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor)
            }
            .foregroundStyle(DesktopTheme.textMuted)
            .padding(.horizontal, 16)
            .frame(height: 42)
            .background(DesktopTheme.panelElevated.opacity(0.55))
            Divider().overlay(DesktopTheme.border)
            Group {
                if detail.status == .pending {
                    ProgressView("Generating AI code review…").controlSize(.small)
                } else if detail.review.isEmpty {
                    Text(detail.status == .failed ? "The last review attempt failed. Retry from the toolbar." : "No AI review has been generated yet.")
                        .foregroundStyle(DesktopTheme.textMuted)
                } else {
                    MarkdownDocumentView(content: detail.review)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 20)
        }
        .background(RoundedRectangle(cornerRadius: 12).fill(DesktopTheme.panel.opacity(0.7)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(DesktopTheme.border))
    }

    private var statusColor: Color {
        switch detail.status {
        case .completed: return .green
        case .pending: return .orange
        case .failed: return DesktopTheme.danger
        default: return DesktopTheme.textMuted
        }
    }
}

private struct MarkdownDocumentView: View {
    let content: String

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 11) {
            ForEach(MarkdownBlockParser.parse(content)) { block in
                MarkdownBlockView(block: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock

    var body: some View {
        switch block.kind {
        case .heading(let level):
            Text(block.attributedText)
                .font(level == 1 ? .title2.weight(.semibold) : level == 2 ? .title3.weight(.semibold) : .headline)
                .foregroundStyle(DesktopTheme.textPrimary)
                .padding(.top, level == 1 ? 5 : 9)
                .padding(.bottom, 2)
                .overlay(alignment: .bottom) {
                    if level <= 2 {
                        Rectangle().fill(DesktopTheme.border).frame(height: 1).offset(y: 7)
                    }
                }
        case .paragraph:
            Text(block.attributedText)
                .font(.body)
                .foregroundStyle(DesktopTheme.textSecondary)
                .lineSpacing(4)
        case .bullet:
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text("•").foregroundStyle(DesktopTheme.textMuted)
                Text(block.attributedText)
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .lineSpacing(3)
            }
            .font(.body)
            .padding(.leading, 14)
        case .task(let checked):
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .font(.caption)
                    .foregroundStyle(checked ? DesktopTheme.accent : DesktopTheme.textMuted)
                Text(block.attributedText)
                    .foregroundStyle(DesktopTheme.textSecondary)
                    .lineSpacing(3)
            }
            .font(.body)
            .padding(.leading, 1)
            .accessibilityLabel("\(checked ? "Completed" : "Not completed"), \(block.text)")
        case .quote:
            Text(block.attributedText)
                .font(.body)
                .foregroundStyle(DesktopTheme.textMuted)
                .padding(.leading, 12)
                .overlay(alignment: .leading) {
                    Rectangle().fill(DesktopTheme.border).frame(width: 3)
                }
        case .code:
            Text(block.text)
                .font(DesktopTheme.monoSmall)
                .foregroundStyle(DesktopTheme.textSecondary)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 6).fill(DesktopTheme.panelElevated))
        case .divider:
            Rectangle().fill(DesktopTheme.border).frame(height: 1).padding(.vertical, 4)
        }
    }
}

private struct MarkdownBlock: Identifiable {
    enum Kind {
        case heading(Int)
        case paragraph
        case bullet
        case task(Bool)
        case quote
        case code
        case divider
    }

    let id: Int
    let kind: Kind
    let text: String

    var attributedText: AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }
}

private enum MarkdownBlockParser {
    static func parse(_ source: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var codeLines: [String] = []
        var inCode = false
        var nextID = 0

        func append(_ kind: MarkdownBlock.Kind, _ text: String) {
            blocks.append(MarkdownBlock(id: nextID, kind: kind, text: text))
            nextID += 1
        }

        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            append(.paragraph, paragraph.joined(separator: "\n"))
            paragraph.removeAll()
        }

        for rawLine in source.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("```") {
                flushParagraph()
                if inCode {
                    append(.code, codeLines.joined(separator: "\n"))
                    codeLines.removeAll()
                }
                inCode.toggle()
                continue
            }
            if inCode {
                codeLines.append(rawLine)
                continue
            }
            if line.isEmpty {
                flushParagraph()
            } else if line == "---" || line == "***" {
                flushParagraph()
                append(.divider, "")
            } else if let heading = heading(from: line) {
                flushParagraph()
                append(.heading(heading.level), heading.text)
            } else if let task = task(from: line) {
                flushParagraph()
                append(.task(task.checked), task.text)
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") || line.hasPrefix("• ") {
                flushParagraph()
                append(.bullet, String(line.dropFirst(2)))
            } else if line.hasPrefix("> ") {
                flushParagraph()
                append(.quote, String(line.dropFirst(2)))
            } else {
                paragraph.append(line)
            }
        }
        flushParagraph()
        if !codeLines.isEmpty { append(.code, codeLines.joined(separator: "\n")) }
        return blocks
    }

    private static func heading(from line: String) -> (level: Int, text: String)? {
        let hashes = line.prefix { $0 == "#" }.count
        guard hashes > 0, hashes <= 6, line.dropFirst(hashes).hasPrefix(" ") else { return nil }
        return (hashes, String(line.dropFirst(hashes + 1)))
    }

    private static func task(from line: String) -> (checked: Bool, text: String)? {
        let lowercased = line.lowercased()
        if lowercased.hasPrefix("- [ ] ") || lowercased.hasPrefix("* [ ] ") {
            return (false, String(line.dropFirst(6)))
        }
        if lowercased.hasPrefix("- [x] ") || lowercased.hasPrefix("* [x] ") {
            return (true, String(line.dropFirst(6)))
        }
        return nil
    }
}

private struct ReviewDiffView: View {
    @EnvironmentObject private var reviewStore: ReviewStore
    let files: [PullRequestDiffFile]

    var body: some View {
        if files.isEmpty {
            ContentUnavailableView("No diff available", systemImage: "doc.text.magnifyingglass")
                .foregroundStyle(DesktopTheme.textSecondary)
        } else {
            ScrollViewReader { proxy in
                ScrollView([.vertical, .horizontal]) {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        ForEach(files) { file in
                            ReviewDiffFileCard(file: file)
                                .id(file.filename)
                        }
                    }
                    .padding(18)
                    .frame(minWidth: 760, alignment: .topLeading)
                }
                .onChange(of: reviewStore.selectedFilename) {
                    guard let filename = reviewStore.selectedFilename else { return }
                    proxy.scrollTo(filename, anchor: .top)
                }
                .onAppear {
                    guard let filename = reviewStore.selectedFilename else { return }
                    proxy.scrollTo(filename, anchor: .top)
                }
            }
        }
    }
}

private struct ReviewDiffFileCard: View {
    let file: PullRequestDiffFile
    @State private var isExpanded = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                HStack(spacing: 8) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(DesktopTheme.textMuted)
                    Text(URL(fileURLWithPath: file.filename).lastPathComponent)
                        .font(DesktopTheme.monoSmall.weight(.semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Text(file.filename.deletingLastPathComponent)
                        .font(DesktopTheme.monoTiny)
                        .foregroundStyle(DesktopTheme.textMuted)
                        .lineLimit(1)
                    Button("Copy file path", systemImage: "doc.on.doc", action: copyPath)
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(DesktopTheme.textMuted)
                    Spacer()
                    Text("+\(file.additions)").foregroundStyle(.green)
                    Text("−\(file.deletions)").foregroundStyle(.red)
                    StatusBadge(status: file.status)
                }
                .font(DesktopTheme.monoTiny)
                .padding(.horizontal, 11)
                .frame(height: 42)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Toggle \(file.filename)")
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .background(DesktopTheme.panelElevated)

            if isExpanded {
                Divider().overlay(DesktopTheme.border)
                if let patch = file.patch {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(SplitDiffParser.parse(patch)) { row in
                            SplitDiffRowView(row: row)
                        }
                    }
                } else {
                    Text("Binary file or patch omitted.")
                        .font(.caption)
                        .foregroundStyle(DesktopTheme.textMuted)
                        .padding(12)
                }
            }
        }
        .background(DesktopTheme.panel)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(DesktopTheme.border))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func toggle() {
        isExpanded.toggle()
    }

    private func copyPath() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(file.filename, forType: .string)
    }
}

private struct StatusBadge: View {
    let status: String

    var body: some View {
        Text(status.uppercased())
            .font(.caption2.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private var color: Color {
        switch status {
        case "added": return .green
        case "removed": return .red
        case "renamed": return .orange
        default: return .blue
        }
    }
}

private struct SplitDiffRowView: View {
    let row: SplitDiffRow

    var body: some View {
        if let hunk = row.hunk {
            Text(hunk)
                .font(DesktopTheme.monoSmall)
                .foregroundStyle(.cyan)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.cyan.opacity(0.07))
        } else {
            HStack(spacing: 0) {
                SplitDiffCell(line: row.left, side: .left)
                Rectangle().fill(DesktopTheme.border).frame(width: 1)
                SplitDiffCell(line: row.right, side: .right)
            }
        }
    }
}

private struct SplitDiffCell: View {
    enum Side { case left, right }

    let line: ReviewDiffLine?
    let side: Side

    var body: some View {
        HStack(spacing: 0) {
            Text(lineNumber)
                .foregroundStyle(DesktopTheme.textMuted)
                .frame(width: 43, alignment: .trailing)
                .padding(.trailing, 8)
            Text(line?.content ?? " ")
                .foregroundStyle(line?.foregroundColor ?? DesktopTheme.textMuted)
                .padding(.leading, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(DesktopTheme.monoSmall)
        .padding(.vertical, 2)
        .padding(.trailing, 8)
        .background(line?.backgroundColor ?? Color.clear)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(line?.accessibilityLabel ?? "Empty diff line")
    }

    private var lineNumber: String {
        guard let line else { return "" }
        let number = side == .left ? line.oldNumber : line.newNumber
        return number.map(String.init) ?? ""
    }
}

private struct ReviewFileTreeNode: Identifiable {
    var id: String { path }
    let name: String
    let path: String
    var children: [ReviewFileTreeNode]
    var file: PullRequestDiffFile?
}

private enum FileTreeBuilder {
    static func build(_ files: [PullRequestDiffFile]) -> [ReviewFileTreeNode] {
        var roots: [ReviewFileTreeNode] = []
        for file in files.sorted(by: { $0.filename < $1.filename }) {
            insert(file, components: file.filename.split(separator: "/").map(String.init), into: &roots, parentPath: "")
        }
        return roots
    }

    static func folderPaths(_ files: [PullRequestDiffFile]) -> [String] {
        var paths: [String] = []
        for file in files {
            let components = file.filename.split(separator: "/").map(String.init)
            guard components.count > 1 else { continue }
            paths.append(contentsOf: (1..<components.count).map {
                components.prefix($0).joined(separator: "/")
            })
        }
        return paths
    }

    private static func insert(_ file: PullRequestDiffFile, components: [String], into nodes: inout [ReviewFileTreeNode], parentPath: String) {
        guard let name = components.first else { return }
        let path = parentPath.isEmpty ? name : "\(parentPath)/\(name)"
        if components.count == 1 {
            nodes.append(ReviewFileTreeNode(name: name, path: path, children: [], file: file))
            return
        }
        if let index = nodes.firstIndex(where: { $0.path == path }) {
            insert(file, components: Array(components.dropFirst()), into: &nodes[index].children, parentPath: path)
        } else {
            var folder = ReviewFileTreeNode(name: name, path: path, children: [], file: nil)
            insert(file, components: Array(components.dropFirst()), into: &folder.children, parentPath: path)
            nodes.append(folder)
        }
    }
}

private struct ReviewDiffLine: Identifiable {
    enum Kind {
        case context
        case addition
        case deletion
        case hunk
        case metadata
    }

    let id: Int
    let oldNumber: Int?
    let newNumber: Int?
    let content: String
    let kind: Kind

    var foregroundColor: Color {
        kind == .hunk ? .cyan : DesktopTheme.textSecondary
    }

    var backgroundColor: Color {
        switch kind {
        case .addition: return .green.opacity(0.09)
        case .deletion: return .red.opacity(0.09)
        case .hunk: return .cyan.opacity(0.07)
        default: return .clear
        }
    }

    var markerColor: Color {
        switch kind {
        case .addition: return .green
        case .deletion: return .red
        case .hunk: return .cyan
        default: return .clear
        }
    }

    var accessibilityLabel: String {
        let lineNumber = newNumber ?? oldNumber
        let prefix = lineNumber.map { "Line \($0), " } ?? ""
        return "\(prefix)\(content)"
    }
}

private struct SplitDiffRow: Identifiable {
    let id: Int
    let left: ReviewDiffLine?
    let right: ReviewDiffLine?
    let hunk: String?
}

private enum SplitDiffParser {
    static func parse(_ patch: String) -> [SplitDiffRow] {
        let lines = DiffParser.parse(patch)
        var rows: [SplitDiffRow] = []
        var pendingDeletions: [ReviewDiffLine] = []
        var nextID = 0

        func flushDeletions() {
            for deletion in pendingDeletions {
                rows.append(SplitDiffRow(id: nextID, left: deletion, right: nil, hunk: nil))
                nextID += 1
            }
            pendingDeletions.removeAll()
        }

        for line in lines {
            switch line.kind {
            case .hunk:
                flushDeletions()
                rows.append(SplitDiffRow(id: nextID, left: nil, right: nil, hunk: line.content))
                nextID += 1
            case .deletion:
                pendingDeletions.append(line)
            case .addition:
                let deletion = pendingDeletions.isEmpty ? nil : pendingDeletions.removeFirst()
                rows.append(SplitDiffRow(id: nextID, left: deletion, right: line, hunk: nil))
                nextID += 1
            case .context, .metadata:
                flushDeletions()
                rows.append(SplitDiffRow(id: nextID, left: line, right: line, hunk: nil))
                nextID += 1
            }
        }
        flushDeletions()
        return rows
    }
}

private enum DiffParser {
    private static let hunkRegex = try! NSRegularExpression(pattern: #"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@"#)

    static func parse(_ patch: String) -> [ReviewDiffLine] {
        var oldLine = 0
        var newLine = 0
        return patch.split(separator: "\n", omittingEmptySubsequences: false).enumerated().map { index, substring in
            let content = String(substring)
            if content.hasPrefix("@@") {
                let range = NSRange(content.startIndex..<content.endIndex, in: content)
                if let match = hunkRegex.firstMatch(in: content, range: range),
                   let oldRange = Range(match.range(at: 1), in: content),
                   let newRange = Range(match.range(at: 2), in: content) {
                    oldLine = Int(content[oldRange]) ?? 0
                    newLine = Int(content[newRange]) ?? 0
                }
                return ReviewDiffLine(id: index, oldNumber: nil, newNumber: nil, content: content, kind: .hunk)
            }
            if content.hasPrefix("+") && !content.hasPrefix("+++") {
                defer { newLine += 1 }
                return ReviewDiffLine(id: index, oldNumber: nil, newNumber: newLine, content: content, kind: .addition)
            }
            if content.hasPrefix("-") && !content.hasPrefix("---") {
                defer { oldLine += 1 }
                return ReviewDiffLine(id: index, oldNumber: oldLine, newNumber: nil, content: content, kind: .deletion)
            }
            if content.hasPrefix("\\") || content.hasPrefix("+++") || content.hasPrefix("---") {
                return ReviewDiffLine(id: index, oldNumber: nil, newNumber: nil, content: content, kind: .metadata)
            }
            defer {
                oldLine += 1
                newLine += 1
            }
            return ReviewDiffLine(id: index, oldNumber: oldLine, newNumber: newLine, content: content, kind: .context)
        }
    }
}

private extension String {
    var deletingLastPathComponent: String {
        let directory = (self as NSString).deletingLastPathComponent
        return directory.isEmpty ? "" : directory
    }
}
