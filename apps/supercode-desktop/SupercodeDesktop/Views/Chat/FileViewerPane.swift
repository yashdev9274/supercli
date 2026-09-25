import AppKit
import SwiftUI

struct OpenEditorFile: Identifiable, Equatable {
    let id: String
    let path: String
    let name: String
    var content: String
    var savedContent: String
    var isBinary: Bool
    var error: String?
    var navigationLine: Int?

    init(path: String, content: String = "", isBinary: Bool = false, error: String? = nil) {
        self.id = path
        self.path = path
        self.name = URL(fileURLWithPath: path).lastPathComponent
        self.content = content
        self.savedContent = content
        self.isBinary = isBinary
        self.error = error
        self.navigationLine = nil
    }

    var language: String { SyntaxHighlighter.language(for: path) }
    var isDirty: Bool { content != savedContent }

    var lineCount: Int {
        if content.isEmpty { return 0 }
        return content.split(separator: "\n", omittingEmptySubsequences: false).count
    }
}

struct FileViewerPane: View {
    @EnvironmentObject private var workspace: WorkspaceStore

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
                                if file.isDirty {
                                    Circle()
                                        .fill(DesktopTheme.textSecondary)
                                        .frame(width: 6, height: 6)
                                }
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
            if file.isDirty {
                Button("Save") {
                    workspace.saveFile(file.id)
                }
                .buttonStyle(.plain)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(DesktopTheme.accent)
                .help("Save file (⌘S)")
            }
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
            CodeTextEditor(
                text: Binding(
                    get: { workspace.openFiles.first(where: { $0.id == file.id })?.content ?? file.content },
                    set: { workspace.updateFileContent(id: file.id, content: $0) }
                ),
                language: file.language,
                filePath: file.path,
                workspaceRoot: workspace.path,
                navigationLine: file.navigationLine,
                openDefinition: { path, line in
                    workspace.openFile(at: path, line: line)
                }
            )
            .clipped()
        }
    }

    private func statusBar(_ file: OpenEditorFile) -> some View {
        HStack(spacing: 12) {
            Text("\(file.lineCount) lines")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(DesktopTheme.textMuted)
            Text(file.isDirty ? "Modified" : "Saved")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(file.isDirty ? DesktopTheme.accent : DesktopTheme.textMuted)
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
        FileVisualStyle.forPath(name).symbol
    }
}

private struct CodeTextEditor: NSViewRepresentable {
    @Binding var text: String
    let language: String
    let filePath: String
    let workspaceRoot: String?
    let navigationLine: Int?
    let openDefinition: (String, Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = true
        scrollView.backgroundColor = NSColor(red: 0.06, green: 0.06, blue: 0.07, alpha: 1)
        scrollView.wantsLayer = true
        scrollView.layer?.masksToBounds = true
        scrollView.contentView.wantsLayer = true
        scrollView.contentView.layer?.masksToBounds = true

        let textView = CodeEditorTextView(frame: .zero)
        textView.delegate = context.coordinator
        textView.symbolDelegate = context.coordinator
        textView.isEditable = true
        textView.isSelectable = true
        textView.isRichText = false
        textView.allowsUndo = true
        textView.usesFindPanel = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.backgroundColor = scrollView.backgroundColor
        textView.textColor = NSColor(red: 0.86, green: 0.86, blue: 0.88, alpha: 1)
        textView.insertionPointColor = NSColor(red: 0.96, green: 0.62, blue: 0.18, alpha: 1)
        textView.font = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
        textView.textContainerInset = NSSize(width: 18, height: 14)
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = true
        textView.autoresizingMask = [.width]
        textView.textContainer?.containerSize = NSSize(
            width: CGFloat.greatestFiniteMagnitude,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.textContainer?.widthTracksTextView = false
        textView.string = text
        scrollView.documentView = textView
        let ruler = LineNumberRulerView(textView: textView)
        scrollView.verticalRulerView = ruler
        scrollView.hasVerticalRuler = true
        scrollView.rulersVisible = true
        context.coordinator.textView = textView
        context.coordinator.lineNumberRuler = ruler
        context.coordinator.highlight(language: language)
        context.coordinator.navigate(to: navigationLine)
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        let fileChanged = context.coordinator.parent.filePath != filePath
        context.coordinator.parent = self
        guard let textView = scrollView.documentView as? NSTextView else { return }
        if textView.string != text {
            let selection = textView.selectedRanges
            textView.string = text
            textView.selectedRanges = selection
        }
        context.coordinator.highlight(language: language)
        context.coordinator.lineNumberRuler?.needsDisplay = true
        if fileChanged {
            scrollView.contentView.scroll(to: .zero)
            scrollView.reflectScrolledClipView(scrollView.contentView)
        }
        context.coordinator.navigate(to: navigationLine)
    }

    final class Coordinator: NSObject, NSTextViewDelegate, CodeEditorTextViewDelegate {
        var parent: CodeTextEditor
        weak var textView: NSTextView?
        weak var lineNumberRuler: LineNumberRulerView?
        private var isHighlighting = false
        private var lastNavigationKey: String?
        private let symbolPopover = NSPopover()

        init(parent: CodeTextEditor) {
            self.parent = parent
        }

        func textDidChange(_ notification: Notification) {
            guard !isHighlighting, let textView else { return }
            parent.text = textView.string
            highlight(language: parent.language)
            lineNumberRuler?.updateThickness()
            lineNumberRuler?.needsDisplay = true
        }

        func codeEditor(_ editor: CodeEditorTextView, hoveredAt characterIndex: Int?, tokenRect: NSRect?) {
            guard let characterIndex,
                  let tokenRect,
                  let result = EditorSymbolResolver.resolve(
                    characterIndex: characterIndex,
                    content: editor.string,
                    filePath: parent.filePath,
                    workspaceRoot: parent.workspaceRoot
                  ) else {
                symbolPopover.close()
                return
            }

            if let current = symbolPopover.contentViewController as? SymbolPopoverViewController,
               current.result == result,
               symbolPopover.isShown {
                return
            }

            symbolPopover.behavior = .semitransient
            symbolPopover.animates = false
            symbolPopover.contentViewController = SymbolPopoverViewController(result: result)
            symbolPopover.show(relativeTo: tokenRect, of: editor, preferredEdge: .maxY)
        }

        func codeEditor(_ editor: CodeEditorTextView, commandClickedAt characterIndex: Int) {
            symbolPopover.close()
            guard let result = EditorSymbolResolver.resolve(
                characterIndex: characterIndex,
                content: editor.string,
                filePath: parent.filePath,
                workspaceRoot: parent.workspaceRoot
            ), let targetPath = result.targetPath, let targetLine = result.targetLine else { return }

            if targetPath == parent.filePath {
                lastNavigationKey = nil
                navigate(to: targetLine)
            } else {
                parent.openDefinition(targetPath, targetLine)
            }
        }

        func navigate(to line: Int?) {
            guard let line, line > 0, let textView else { return }
            let key = "\(parent.filePath):\(line)"
            guard key != lastNavigationKey else { return }
            lastNavigationKey = key
            let string = textView.string as NSString
            var currentLine = 1
            var location = 0
            while currentLine < line && location < string.length {
                var lineEnd = 0
                string.getLineStart(nil, end: &lineEnd, contentsEnd: nil, for: NSRange(location: location, length: 0))
                location = lineEnd
                currentLine += 1
            }
            guard location <= string.length else { return }
            textView.setSelectedRange(NSRange(location: location, length: 0))
            textView.scrollRangeToVisible(NSRange(location: location, length: 0))
            textView.window?.makeFirstResponder(textView)
        }

        func highlight(language: String) {
            guard let textView, let storage = textView.textStorage, !isHighlighting else { return }
            isHighlighting = true
            let selection = textView.selectedRanges
            let fullRange = NSRange(location: 0, length: storage.length)
            let baseFont = NSFont.monospacedSystemFont(ofSize: 12.5, weight: .regular)
            storage.beginEditing()
            storage.addAttributes([
                .font: baseFont,
                .foregroundColor: NSColor(red: 0.86, green: 0.86, blue: 0.88, alpha: 1),
            ], range: fullRange)

            var location = 0
            for line in textView.string.components(separatedBy: "\n") {
                var tokenLocation = location
                for token in SyntaxHighlighter.tokens(for: line, language: language) {
                    let tokenLength = (token.text as NSString).length
                    if tokenLocation + tokenLength <= storage.length {
                        storage.addAttribute(
                            .foregroundColor,
                            value: NSColor(SyntaxHighlighter.color(for: token.kind)),
                            range: NSRange(location: tokenLocation, length: tokenLength)
                        )
                    }
                    tokenLocation += tokenLength
                }
                location += (line as NSString).length + 1
            }
            storage.endEditing()
            textView.selectedRanges = selection
            isHighlighting = false
        }
    }
}

private protocol CodeEditorTextViewDelegate: AnyObject {
    func codeEditor(_ editor: CodeEditorTextView, hoveredAt characterIndex: Int?, tokenRect: NSRect?)
    func codeEditor(_ editor: CodeEditorTextView, commandClickedAt characterIndex: Int)
}

private final class CodeEditorTextView: NSTextView {
    weak var symbolDelegate: CodeEditorTextViewDelegate?
    private var tracking: NSTrackingArea?
    private var lastHoveredCharacter: Int?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let tracking { removeTrackingArea(tracking) }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(area)
        tracking = area
    }

    override func mouseMoved(with event: NSEvent) {
        super.mouseMoved(with: event)
        let point = convert(event.locationInWindow, from: nil)
        guard bounds.contains(point), !string.isEmpty else {
            clearHover()
            return
        }
        let index = characterIndexForInsertion(at: point)
        guard index < (string as NSString).length else {
            clearHover()
            return
        }
        if event.modifierFlags.contains(.command) {
            NSCursor.pointingHand.set()
        } else {
            NSCursor.iBeam.set()
        }
        guard index != lastHoveredCharacter else { return }
        lastHoveredCharacter = index
        symbolDelegate?.codeEditor(self, hoveredAt: index, tokenRect: tokenRect(at: index))
    }

    override func mouseExited(with event: NSEvent) {
        super.mouseExited(with: event)
        clearHover()
    }

    override func mouseDown(with event: NSEvent) {
        if event.modifierFlags.contains(.command) {
            let point = convert(event.locationInWindow, from: nil)
            let index = characterIndexForInsertion(at: point)
            if index < (string as NSString).length {
                symbolDelegate?.codeEditor(self, commandClickedAt: index)
                return
            }
        }
        super.mouseDown(with: event)
    }

    private func clearHover() {
        lastHoveredCharacter = nil
        symbolDelegate?.codeEditor(self, hoveredAt: nil, tokenRect: nil)
    }

    private func tokenRect(at characterIndex: Int) -> NSRect? {
        guard let layoutManager, let textContainer else { return nil }
        let wordRange = EditorSymbolResolver.wordRange(at: characterIndex, in: string)
        guard wordRange.length > 0 else { return nil }
        let glyphRange = layoutManager.glyphRange(forCharacterRange: wordRange, actualCharacterRange: nil)
        var rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
        rect.origin.x += textContainerOrigin.x
        rect.origin.y += textContainerOrigin.y
        return rect
    }
}

private final class LineNumberRulerView: NSRulerView {
    private weak var textView: NSTextView?
    private let font = NSFont.monospacedDigitSystemFont(ofSize: 10.5, weight: .regular)

    init(textView: NSTextView) {
        self.textView = textView
        super.init(scrollView: textView.enclosingScrollView, orientation: .verticalRuler)
        clientView = textView
        ruleThickness = 44
        wantsLayer = true
        layer?.masksToBounds = true
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isFlipped: Bool { true }

    func updateThickness() {
        let count = max(1, textView?.string.components(separatedBy: "\n").count ?? 1)
        ruleThickness = max(44, CGFloat(String(count).count * 8 + 20))
    }

    override func drawHashMarksAndLabels(in rect: NSRect) {
        guard let textView,
              let layoutManager = textView.layoutManager,
              let textContainer = textView.textContainer else { return }

        NSColor(red: 0.05, green: 0.05, blue: 0.06, alpha: 1).setFill()
        bounds.fill()
        NSColor.white.withAlphaComponent(0.07).setFill()
        NSRect(x: bounds.maxX - 1, y: bounds.minY, width: 1, height: bounds.height).fill()

        let visibleGlyphRange = layoutManager.glyphRange(forBoundingRect: textView.visibleRect, in: textContainer)
        let string = textView.string as NSString
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.white.withAlphaComponent(0.32),
        ]

        layoutManager.enumerateLineFragments(forGlyphRange: visibleGlyphRange) { _, usedRect, _, glyphRange, _ in
            let characterIndex = layoutManager.characterIndexForGlyph(at: glyphRange.location)
            let prefixRange = NSRange(location: 0, length: min(characterIndex, string.length))
            var lineNumber = 1
            if prefixRange.length > 0 {
                lineNumber += string.substring(with: prefixRange).reduce(into: 0) { count, character in
                    if character == "\n" { count += 1 }
                }
            }
            let label = "\(lineNumber)" as NSString
            let size = label.size(withAttributes: attributes)
            let labelY = EditorLayoutGeometry.rulerLabelY(
                lineFragmentY: usedRect.minY,
                lineHeight: usedRect.height,
                labelHeight: size.height,
                textInsetY: textView.textContainerOrigin.y,
                visibleOriginY: textView.visibleRect.minY
            )
            guard labelY + size.height >= self.bounds.minY,
                  labelY <= self.bounds.maxY else { return }
            label.draw(
                at: NSPoint(x: self.bounds.width - size.width - 10, y: labelY),
                withAttributes: attributes
            )
        }
    }
}

enum EditorLayoutGeometry {
    static func rulerLabelY(
        lineFragmentY: CGFloat,
        lineHeight: CGFloat,
        labelHeight: CGFloat,
        textInsetY: CGFloat,
        visibleOriginY: CGFloat
    ) -> CGFloat {
        lineFragmentY + textInsetY - visibleOriginY + (lineHeight - labelHeight) / 2
    }
}

private struct EditorSymbolResult: Equatable {
    let symbol: String
    let kind: String
    let signature: String
    let source: String?
    let targetPath: String?
    let targetLine: Int?
}

private final class SymbolPopoverViewController: NSViewController {
    let result: EditorSymbolResult

    init(result: EditorSymbolResult) {
        self.result = result
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func loadView() {
        let container = NSView()
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor(red: 0.085, green: 0.085, blue: 0.095, alpha: 1).cgColor
        container.layer?.cornerRadius = 6

        let kindLabel = NSTextField(labelWithString: result.kind)
        kindLabel.font = NSFont.monospacedSystemFont(ofSize: 10.5, weight: .medium)
        kindLabel.textColor = NSColor(red: 0.46, green: 0.72, blue: 0.92, alpha: 1)

        let signatureLabel = NSTextField(wrappingLabelWithString: result.signature)
        signatureLabel.font = NSFont.monospacedSystemFont(ofSize: 11.5, weight: .regular)
        signatureLabel.textColor = NSColor(red: 0.90, green: 0.90, blue: 0.92, alpha: 1)
        signatureLabel.maximumNumberOfLines = 4

        let stack = NSStackView(views: [kindLabel, signatureLabel])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 6
        if let source = result.source {
            let sourceLabel = NSTextField(labelWithString: source)
            sourceLabel.font = NSFont.monospacedSystemFont(ofSize: 9.5, weight: .regular)
            sourceLabel.textColor = NSColor.white.withAlphaComponent(0.40)
            sourceLabel.lineBreakMode = .byTruncatingMiddle
            stack.addArrangedSubview(sourceLabel)
        }
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -12),
            stack.topAnchor.constraint(equalTo: container.topAnchor, constant: 10),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -10),
        ])
        preferredContentSize = NSSize(width: 360, height: result.source == nil ? 66 : 84)
        view = container
    }
}

private enum EditorSymbolResolver {
    private struct Definition {
        let line: Int
        let signature: String
        let kind: String
    }

    static func resolve(
        characterIndex: Int,
        content: String,
        filePath: String,
        workspaceRoot: String?
    ) -> EditorSymbolResult? {
        let range = wordRange(at: characterIndex, in: content)
        guard range.length > 0 else { return nil }
        let symbol = (content as NSString).substring(with: range)
        guard symbol.first?.isLetter == true || symbol.first == "_" else { return nil }

        let lineRange = (content as NSString).lineRange(for: NSRange(location: characterIndex, length: 0))
        let sourceLine = (content as NSString).substring(with: lineRange)
        if let importSource = importSource(from: sourceLine),
           let root = workspaceRoot {
            let targetPath = resolveImport(importSource, from: filePath, workspaceRoot: root)
            if let targetPath,
               let targetContent = try? String(contentsOfFile: targetPath, encoding: .utf8),
               let definition = definition(of: symbol, in: targetContent) {
                return EditorSymbolResult(
                    symbol: symbol,
                    kind: "(alias) \(definition.kind)",
                    signature: definition.signature,
                    source: relativePath(targetPath, root: root),
                    targetPath: targetPath,
                    targetLine: definition.line
                )
            }
            return EditorSymbolResult(
                symbol: symbol,
                kind: "import",
                signature: "module \"\(importSource)\"",
                source: targetPath.map { relativePath($0, root: root) },
                targetPath: targetPath,
                targetLine: targetPath == nil ? nil : 1
            )
        }

        if let definition = definition(of: symbol, in: content) {
            return EditorSymbolResult(
                symbol: symbol,
                kind: definition.kind,
                signature: definition.signature,
                source: workspaceRoot.map { relativePath(filePath, root: $0) },
                targetPath: filePath,
                targetLine: definition.line
            )
        }

        if let imported = importedModule(for: symbol, in: content), let root = workspaceRoot {
            let targetPath = resolveImport(imported, from: filePath, workspaceRoot: root)
            if let targetPath,
               let targetContent = try? String(contentsOfFile: targetPath, encoding: .utf8),
               let definition = definition(of: symbol, in: targetContent) {
                return EditorSymbolResult(
                    symbol: symbol,
                    kind: "(alias) \(definition.kind)",
                    signature: definition.signature,
                    source: relativePath(targetPath, root: root),
                    targetPath: targetPath,
                    targetLine: definition.line
                )
            }
            return EditorSymbolResult(
                symbol: symbol,
                kind: "import",
                signature: "module \"\(imported)\"",
                source: targetPath.map { relativePath($0, root: root) },
                targetPath: targetPath,
                targetLine: targetPath == nil ? nil : 1
            )
        }

        return nil
    }

    static func wordRange(at characterIndex: Int, in content: String) -> NSRange {
        let text = content as NSString
        guard text.length > 0 else { return NSRange(location: 0, length: 0) }
        let index = min(max(characterIndex, 0), text.length - 1)
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_$"))
        var start = index
        while start > 0,
              let scalar = UnicodeScalar(text.character(at: start - 1)),
              allowed.contains(scalar) {
            start -= 1
        }
        var end = index
        while end < text.length,
              let scalar = UnicodeScalar(text.character(at: end)),
              allowed.contains(scalar) {
            end += 1
        }
        return NSRange(location: start, length: end - start)
    }

    private static func definition(of symbol: String, in content: String) -> Definition? {
        let escaped = NSRegularExpression.escapedPattern(for: symbol)
        let patterns: [(String, String)] = [
            (#"\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+"# + escaped + #"\s*\([^\n{]*\)"#, "function"),
            (#"\b(?:export\s+)?(?:const|let|var)\s+"# + escaped + #"(?:\s*:[^=\n]+)?\s*=\s*(?:async\s*)?(?:\([^\n)]*\)|[A-Za-z_$][\w$]*)\s*=>"#, symbol.first?.isUppercase == true ? "const component" : "const function"),
            (#"\b(?:export\s+)?(?:const|let|var)\s+"# + escaped + #"(?:\s*:[^=\n]+)?\s*=[^\n;]*"#, "variable"),
            (#"\bdef\s+"# + escaped + #"\s*\([^\n:]*\)(?:\s*->\s*[^:\n]+)?"#, "function"),
            (#"\bfunc\s+"# + escaped + #"\s*\([^\n{]*\)(?:\s*(?:async\s*)?(?:throws\s*)?->\s*[^\n{]+)?"#, "function"),
            (#"\b(?:class|struct|interface|type|enum)\s+"# + escaped + #"\b[^\n{]*"#, "type"),
        ]

        let nsContent = content as NSString
        for (pattern, kind) in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: content, range: NSRange(location: 0, length: nsContent.length)) else { continue }
            let prefix = nsContent.substring(to: match.range.location)
            let line = prefix.reduce(into: 1) { count, character in
                if character == "\n" { count += 1 }
            }
            let signature = nsContent.substring(with: match.range)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return Definition(line: line, signature: signature, kind: kind)
        }
        return nil
    }

    private static func importSource(from line: String) -> String? {
        let patterns = [
            #"\bfrom\s+[\"']([^\"']+)[\"']"#,
            #"\bimport\s+[\"']([^\"']+)[\"']"#,
            #"^\s*from\s+([A-Za-z_][\w.]*)\s+import\b"#,
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
                  match.numberOfRanges > 1,
                  let range = Range(match.range(at: 1), in: line) else { continue }
            return String(line[range])
        }
        return nil
    }

    private static func importedModule(for symbol: String, in content: String) -> String? {
        for line in content.components(separatedBy: "\n") where line.contains("import") && line.contains(symbol) {
            if let source = importSource(from: line) { return source }
        }
        return nil
    }

    private static func resolveImport(_ source: String, from filePath: String, workspaceRoot: String) -> String? {
        let root = URL(fileURLWithPath: workspaceRoot).standardizedFileURL
        let base: URL
        if source.hasPrefix("@/") {
            let aliasRoot = nearestProjectRoot(from: filePath, workspaceRoot: root)
            base = aliasRoot.appendingPathComponent(String(source.dropFirst(2)))
        } else if source.hasPrefix("~/") {
            base = root.appendingPathComponent(String(source.dropFirst(2)))
        } else if source.hasPrefix(".") {
            base = URL(fileURLWithPath: filePath).deletingLastPathComponent().appendingPathComponent(source)
        } else if (filePath as NSString).pathExtension.lowercased() == "py" {
            base = root.appendingPathComponent(source.replacingOccurrences(of: ".", with: "/"))
        } else {
            return nil
        }

        let extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".swift", ".json"]
        let candidates = extensions.map { URL(fileURLWithPath: base.path + $0) }
            + extensions.dropFirst().map { base.appendingPathComponent("index\($0)") }
            + [base.appendingPathComponent("__init__.py")]
        for candidate in candidates {
            let standardized = candidate.standardizedFileURL
            guard standardized.path == root.path || standardized.path.hasPrefix(root.path + "/") else { continue }
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: standardized.path, isDirectory: &isDirectory), !isDirectory.boolValue {
                return standardized.path
            }
        }
        return nil
    }

    private static func nearestProjectRoot(from filePath: String, workspaceRoot: URL) -> URL {
        var directory = URL(fileURLWithPath: filePath).deletingLastPathComponent().standardizedFileURL
        while directory.path == workspaceRoot.path || directory.path.hasPrefix(workspaceRoot.path + "/") {
            if FileManager.default.fileExists(atPath: directory.appendingPathComponent("tsconfig.json").path)
                || FileManager.default.fileExists(atPath: directory.appendingPathComponent("jsconfig.json").path) {
                return directory
            }
            guard directory.path != workspaceRoot.path else { break }
            directory.deleteLastPathComponent()
        }
        return workspaceRoot
    }

    private static func relativePath(_ path: String, root: String) -> String {
        guard path.hasPrefix(root) else { return path }
        return String(path.dropFirst(root.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }
}
