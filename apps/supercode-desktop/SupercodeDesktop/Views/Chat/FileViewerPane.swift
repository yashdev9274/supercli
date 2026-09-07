import AppKit
import SwiftUI

struct OpenEditorFile: Identifiable, Equatable {
    let id: String
    let path: String
    let name: String
    var content: String
    var isBinary: Bool
    var error: String?

    init(path: String, content: String = "", isBinary: Bool = false, error: String? = nil) {
        self.id = path
        self.path = path
        self.name = URL(fileURLWithPath: path).lastPathComponent
        self.content = content
        self.isBinary = isBinary
        self.error = error
    }

    var language: String { SyntaxHighlighter.language(for: path) }

    var lineCount: Int {
        if content.isEmpty { return 0 }
        return content.split(separator: "\n", omittingEmptySubsequences: false).count
    }
}

struct FileViewerPane: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    @State private var hoveredLine: Int?

    var body: some View {
        VStack(spacing: 0) {
            tabStrip
            Divider().overlay(DesktopTheme.border)
            if let file = workspace.openFiles.first(where: { $0.id == workspace.activeFileId })
                ?? workspace.openFiles.first {
                pathBreadcrumb(file)
                Divider().overlay(DesktopTheme.border.opacity(0.6))
                editorBody(file)
                statusBar(file)
            } else {
                empty
            }
        }
        .background(DesktopTheme.background)
    }

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(workspace.openFiles) { file in
                    let active = workspace.activeFileId == file.id
                    HStack(spacing: 6) {
                        Button {
                            workspace.activeFileId = file.id
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: iconName(for: file.name))
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(active ? DesktopTheme.accent : DesktopTheme.textMuted)
                                Text(file.name)
                                    .font(.system(size: 12, weight: active ? .semibold : .regular))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(active ? DesktopTheme.textPrimary : DesktopTheme.textSecondary)
                        }
                        .buttonStyle(.plain)

                        Button {
                            workspace.closeFile(file.id)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(DesktopTheme.textMuted)
                                .padding(4)
                        }
                        .buttonStyle(.plain)
                        .help("Close")
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(active ? DesktopTheme.panelElevated : Color.clear)
                    .overlay(alignment: .bottom) {
                        Rectangle()
                            .fill(active ? DesktopTheme.accent : Color.clear)
                            .frame(height: 2)
                    }

                    Divider().overlay(DesktopTheme.border).frame(height: 22)
                }
            }
        }
        .frame(height: 36)
        .background(DesktopTheme.panel)
    }

    private func pathBreadcrumb(_ file: OpenEditorFile) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "doc.text")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(DesktopTheme.textMuted)
            Text(relativePath(file.path))
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textSecondary)
                .lineLimit(1)
                .textSelection(.enabled)
            Spacer()
            Text(file.language.uppercased())
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(DesktopTheme.panelElevated))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(DesktopTheme.panel.opacity(0.7))
    }

    @ViewBuilder
    private func editorBody(_ file: OpenEditorFile) -> some View {
        if let error = file.error {
            VStack(spacing: 10) {
                Spacer()
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(DesktopTheme.danger)
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(DesktopTheme.textSecondary)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if file.isBinary {
            VStack(spacing: 10) {
                Spacer()
                Image(systemName: "doc")
                    .font(.system(size: 28))
                    .foregroundStyle(DesktopTheme.textMuted)
                Text("Binary file")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DesktopTheme.textPrimary)
                Text(file.path)
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
                Button("Reveal in Finder") {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: file.path)])
                }
                .buttonStyle(.plain)
                .foregroundStyle(DesktopTheme.accent)
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView([.vertical, .horizontal], showsIndicators: true) {
                LazyVStack(alignment: .leading, spacing: 0) {
                    let lines = file.content.split(separator: "\n", omittingEmptySubsequences: false)
                    ForEach(Array(lines.enumerated()), id: \.offset) { idx, line in
                        SyntaxLineView(
                            lineNumber: idx + 1,
                            text: String(line),
                            language: file.language,
                            isCurrent: hoveredLine == idx + 1
                        )
                        .onHover { hovering in
                            hoveredLine = hovering ? idx + 1 : (hoveredLine == idx + 1 ? nil : hoveredLine)
                        }
                    }
                }
                .padding(.vertical, 10)
                .frame(minWidth: 640, alignment: .leading)
            }
            .background(DesktopTheme.background)
        }
    }

    private func statusBar(_ file: OpenEditorFile) -> some View {
        HStack(spacing: 12) {
            Text("\(file.lineCount) lines")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
            if let hoveredLine {
                Text("Ln \(hoveredLine)")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textSecondary)
            }
            Spacer()
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(file.path, forType: .string)
            } label: {
                Label("Copy path", systemImage: "doc.on.doc")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
            }
            .buttonStyle(.plain)
            Button {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: file.path)])
            } label: {
                Label("Reveal", systemImage: "folder")
                    .font(DesktopTheme.monoTiny)
                    .foregroundStyle(DesktopTheme.textMuted)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(DesktopTheme.panel)
        .overlay(alignment: .top) {
            Divider().overlay(DesktopTheme.border)
        }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 28))
                .foregroundStyle(DesktopTheme.textMuted)
            Text("No file open")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DesktopTheme.textSecondary)
            Text("Select a file from the workspace explorer")
                .font(.system(size: 12))
                .foregroundStyle(DesktopTheme.textMuted)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func relativePath(_ path: String) -> String {
        if let root = workspace.path, path.hasPrefix(root) {
            let rel = String(path.dropFirst(root.count))
            return rel.hasPrefix("/") ? String(rel.dropFirst()) : rel
        }
        return path
    }

    private func iconName(for name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "swift": return "swift"
        case "ts", "tsx", "js", "jsx": return "curlybraces"
        case "md", "mdx": return "doc.richtext"
        case "json", "yml", "yaml": return "list.bullet.indent"
        case "png", "jpg", "jpeg", "gif", "svg", "webp": return "photo"
        default: return "doc.text"
        }
    }
}
