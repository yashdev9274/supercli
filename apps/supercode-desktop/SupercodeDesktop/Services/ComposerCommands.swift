import Foundation

/// Desktop composer `/` and `@` pickers (aligned with CLI slash commands + desk6/desk7).
enum ComposerCommands {
    struct SlashCommand: Identifiable, Hashable {
        let id: String
        let command: String
        let title: String
        let subtitle: String
        let systemImage: String
        /// When true, selecting inserts the command and sends immediately if no args needed.
        let autoSend: Bool

        var insertText: String { command.hasSuffix(" ") ? command : command + " " }
    }

    struct MentionItem: Identifiable, Hashable {
        enum Kind: String {
            case file
            case folder
            case symbol
            case docs
            case web
            case pastChat
        }

        let id: String
        let label: String
        let detail: String
        let kind: Kind
        let insertText: String
        let systemImage: String
    }

    static let slashCommands: [SlashCommand] = [
        .init(id: "model", command: "/model", title: "model", subtitle: "Switch AI provider or model", systemImage: "cpu", autoSend: false),
        .init(id: "plan", command: "/plan", title: "plan", subtitle: "Switch to plan mode (read-only)", systemImage: "list.clipboard", autoSend: true),
        .init(id: "agent", command: "/agent", title: "agent", subtitle: "Full coding agent with tools", systemImage: "bolt.fill", autoSend: true),
        .init(id: "context", command: "/context", title: "context", subtitle: "Show context window usage", systemImage: "chart.bar", autoSend: true),
        .init(id: "compact", command: "/compact", title: "compact", subtitle: "Compress conversation history", systemImage: "arrow.down.right.and.arrow.up.left", autoSend: true),
        .init(id: "clear", command: "/clear", title: "clear", subtitle: "Clear current session messages", systemImage: "trash", autoSend: true),
        .init(id: "new", command: "/new", title: "new", subtitle: "Start a new conversation", systemImage: "square.and.pencil", autoSend: true),
        .init(id: "search", command: "/search ", title: "search", subtitle: "Search the web", systemImage: "magnifyingglass", autoSend: false),
        .init(id: "scrape", command: "/scrape ", title: "scrape", subtitle: "Scrape a URL to markdown", systemImage: "doc.richtext", autoSend: false),
        .init(id: "usage", command: "/usage", title: "usage", subtitle: "Show daily token usage", systemImage: "gauge.with.dots.needle.33percent", autoSend: true),
        .init(id: "skills", command: "/skills", title: "skills", subtitle: "List installed agent skills", systemImage: "book", autoSend: true),
        .init(id: "mcp", command: "/mcp", title: "mcp", subtitle: "Manage MCP connections", systemImage: "network", autoSend: false),
        .init(id: "upgrade", command: "/upgrade", title: "upgrade", subtitle: "Billing / plan upgrade options", systemImage: "sparkles", autoSend: true),
        .init(id: "help", command: "/help", title: "help", subtitle: "Show available commands", systemImage: "questionmark.circle", autoSend: true),
        .init(id: "crisp-review", command: "/crisp-review", title: "crisp-review", subtitle: "Review git diff for simplicity", systemImage: "checkmark.seal", autoSend: true),
        .init(id: "verbose", command: "/verbose", title: "verbose", subtitle: "Toggle tool debug logs", systemImage: "ladybug", autoSend: true),
    ]

    static func filteredSlash(query: String) -> [SlashCommand] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let bare = q.hasPrefix("/") ? String(q.dropFirst()) : q
        guard !bare.isEmpty else { return slashCommands }
        return slashCommands.filter {
            $0.title.lowercased().contains(bare)
                || $0.command.lowercased().contains(bare)
                || $0.subtitle.lowercased().contains(bare)
        }
    }

    static func mentionItems(
        query: String,
        workspacePath: String?,
        fileNames: [String],
        recentChats: [String]
    ) -> [MentionItem] {
        var items: [MentionItem] = []
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let bare = q.hasPrefix("@") ? String(q.dropFirst()) : q

        // Built-in targets (desk7-style)
        let builtins: [MentionItem] = [
            .init(id: "codebase", label: "Codebase", detail: "Whole workspace", kind: .folder, insertText: "@codebase ", systemImage: "shippingbox"),
            .init(id: "web", label: "Web", detail: "Search the internet", kind: .web, insertText: "@web ", systemImage: "globe"),
            .init(id: "docs", label: "Docs", detail: "Project documentation", kind: .docs, insertText: "@docs ", systemImage: "book.closed"),
            .init(id: "git", label: "Git", detail: "Repo status & history", kind: .symbol, insertText: "@git ", systemImage: "arrow.triangle.branch"),
        ]
        items.append(contentsOf: builtins)

        for name in fileNames.prefix(40) {
            let path = workspacePath.map { ($0 as NSString).appendingPathComponent(name) } ?? name
            items.append(
                .init(
                    id: "file:\(path)",
                    label: name,
                    detail: path,
                    kind: .file,
                    insertText: "@\(name) ",
                    systemImage: "doc.text"
                )
            )
        }

        for (idx, title) in recentChats.prefix(8).enumerated() {
            items.append(
                .init(
                    id: "chat:\(idx)",
                    label: title,
                    detail: "Past chat",
                    kind: .pastChat,
                    insertText: "@chat:\(title.prefix(24)) ",
                    systemImage: "bubble.left.and.bubble.right"
                )
            )
        }

        guard !bare.isEmpty else { return items }
        return items.filter {
            $0.label.lowercased().contains(bare)
                || $0.detail.lowercased().contains(bare)
                || $0.kind.rawValue.contains(bare)
        }
    }
}
