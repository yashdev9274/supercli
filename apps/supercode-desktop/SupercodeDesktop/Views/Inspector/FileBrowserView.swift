import AppKit
import SwiftUI

struct RightSidebarView: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    @EnvironmentObject private var agentRun: AgentRunStore

    var body: some View {
        VStack(spacing: 0) {
            tabBar
            Divider().overlay(DesktopTheme.border)

            if workspace.fileBrowserTab == .allFiles {
                FileBrowserView()
            } else {
                DiffInspectorView(embedded: true)
            }
        }
        .background(DesktopTheme.panel)
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(FileBrowserTab.allCases) { tab in
                Button {
                    workspace.fileBrowserTab = tab
                } label: {
                    HStack(spacing: 6) {
                        Text(tab.title)
                            .font(.system(size: 11, weight: .semibold))
                        if tab == .changes {
                            Text("\(agentRun.diffs.count)")
                                .font(DesktopTheme.monoTiny)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(Capsule().fill(DesktopTheme.background))
                        }
                    }
                    .foregroundStyle(workspace.fileBrowserTab == tab ? DesktopTheme.textPrimary : DesktopTheme.textMuted)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .fill(workspace.fileBrowserTab == tab ? DesktopTheme.panelElevated : Color.clear)
                    )
                }
                .buttonStyle(.plain)
            }
            Spacer()
            if workspace.path != nil {
                Button {
                    workspace.reloadTree()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textMuted)
                }
                .buttonStyle(.plain)
                .help("Refresh files")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }
}

struct FileBrowserView: View {
    @EnvironmentObject private var workspace: WorkspaceStore

    var body: some View {
        Group {
            if workspace.path == nil {
                emptyWorkspace
            } else if workspace.isLoadingTree && workspace.rootNodes.isEmpty {
                VStack {
                    Spacer()
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading files…")
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.textMuted)
                        .padding(.top, 8)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = workspace.treeError {
                VStack(spacing: 8) {
                    Spacer()
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundStyle(DesktopTheme.danger)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)
                    Button("Retry") { workspace.reloadTree() }
                        .buttonStyle(.plain)
                        .foregroundStyle(DesktopTheme.accent)
                    Spacer()
                }
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        headerRow
                        ForEach(workspace.rootNodes) { node in
                            FileTreeRow(node: node, depth: 0)
                        }
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 4)
                }
            }
        }
    }

    private var headerRow: some View {
        HStack(spacing: 6) {
            Image(systemName: "internaldrive")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(DesktopTheme.accent)
            Text(workspace.displayName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DesktopTheme.textPrimary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
    }

    private var emptyWorkspace: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "folder.badge.plus")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(DesktopTheme.textMuted)
            Text("Connect a local workspace")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DesktopTheme.textPrimary)
            Text("Open a project folder to browse its files here.")
                .font(.system(size: 12))
                .foregroundStyle(DesktopTheme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
            Button("Open Workspace…") { workspace.pickWorkspace() }
                .buttonStyle(.borderedProminent)
                .tint(DesktopTheme.accent)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct FileTreeRow: View {
    @EnvironmentObject private var workspace: WorkspaceStore
    let node: WorkspaceNode
    let depth: Int

    private var isExpanded: Bool {
        workspace.expandedPaths.contains(node.path)
    }

    private var isSelected: Bool {
        workspace.selectedPath == node.path
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Button {
                workspace.toggleExpanded(node)
            } label: {
                HStack(spacing: 6) {
                    if node.isDirectory {
                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(DesktopTheme.textMuted)
                            .frame(width: 10)
                    } else {
                        Color.clear.frame(width: 10)
                    }

                    Image(systemName: node.systemImage)
                        .font(.system(size: 11))
                        .foregroundStyle(node.isDirectory ? DesktopTheme.accent : DesktopTheme.textSecondary)
                        .frame(width: 14)

                    Text(node.name)
                        .font(.system(size: 12))
                        .foregroundStyle(isSelected ? DesktopTheme.textPrimary : DesktopTheme.textSecondary)
                        .lineLimit(1)

                    Spacer(minLength: 0)
                }
                .padding(.leading, CGFloat(8 + depth * 12))
                .padding(.trailing, 8)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(isSelected ? DesktopTheme.panelElevated : Color.clear)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
.contextMenu {
                if !node.isDirectory {
                    Button("Open in Editor") {
                        workspace.openFile(at: node.path)
                    }
                }
                Button("Reveal in Finder") {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: node.path)])
                }
                Button("Copy Path") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(node.path, forType: .string)
                }
            }

            if node.isDirectory, isExpanded, let children = node.children {
                ForEach(children) { child in
                    FileTreeRow(node: child, depth: depth + 1)
                }
            }
        }
    }
}
