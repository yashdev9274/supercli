import AppKit
import Combine

/// Lets the user pick a screen region by holding Cmd and dragging (or
/// circling) over any window. The voice agent then crops its screen vision to
/// exactly that region, so it can answer questions about the selected content
/// with full context (e.g. select part of a blog post → "explain this").
///
/// Gesture:
/// - Cmd + left-drag over any window starts a selection; the drag rectangle is
///   shown live as a cut-out with a white border on a dimmed overlay.
/// - Releasing the mouse finalizes the selection (needs ≥16pt in each axis).
/// - Escape (while a selection exists) clears it. A new Cmd+drag replaces it.
///
/// Implementation notes:
/// - Borderless overlay windows run at `.screenSaver` level and ignore mouse
///   events so they never block the underlying app.
/// - Global event monitors don't receive mouseDown/mouseUp, so the end of a
///   drag over another app is detected via `NSEvent.pressedMouseButtons` on
///   the global `leftMouseDragged` events.
final class ScreenSelectionManager: NSObject, ObservableObject {
    static let shared = ScreenSelectionManager()

    /// Finalized selection in AppKit global coordinates (points, bottom-left
    /// origin). Nil when no selection is active.
    @Published private(set) var selection: CGRect?
    /// The display the selection was drawn on (for cropping the right frame).
    @Published private(set) var selectionDisplayID: CGDirectDisplayID?

    private var overlayWindows: [NSWindow] = []
    private var dragStart: NSPoint?
    private var isDragging = false
    private var liveRect: CGRect?
    private var localMonitor: Any?
    private var globalMonitor: Any?
    private var observers: [NSObjectProtocol] = []

    private override init() {
        super.init()
        installMonitors()
        installObservers()
    }

    /// Shows the overlay infrastructure. Safe to call repeatedly.
    func start() {
        rebuildOverlayWindows()
    }

    /// Clears the current selection and hides the overlays.
    func clearSelection() {
        selection = nil
        selectionDisplayID = nil
        isDragging = false
        dragStart = nil
        liveRect = nil
        overlayWindows.forEach { $0.orderOut(nil) }
    }

    // MARK: - Event monitoring

    private func installMonitors() {
        // Local monitor: full mouse lifecycle when Jarvis is frontmost.
        localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .leftMouseDragged, .leftMouseUp, .keyDown]) { [weak self] event in
            self?.handleLocal(event)
            return event
        }
        // Global monitor: Cmd+drag over other apps. Global monitors only see
        // keyDown, flagsChanged, mouseMoved, and the mouseDragged variants, so
        // the drag start is synthesized from the first dragged event while Cmd
        // is held, and the drag end from `NSEvent.pressedMouseButtons`.
        globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDragged, .keyDown]) { [weak self] event in
            self?.handleGlobal(event)
        }
    }

    private func handleLocal(_ event: NSEvent) {
        switch event.type {
        case .leftMouseDown:
            guard event.modifierFlags.contains(.command) else { return }
            beginDrag()
        case .leftMouseDragged:
            guard isDragging, let start = dragStart else { return }
            updateLiveRect(to: NSEvent.mouseLocation)
        case .leftMouseUp:
            guard isDragging else { return }
            finalizeSelection(at: NSEvent.mouseLocation)
        case .keyDown:
            if event.keyCode == 53, selection != nil { // Escape
                clearSelection()
            }
        default:
            break
        }
    }

    private func handleGlobal(_ event: NSEvent) {
        switch event.type {
        case .leftMouseDragged:
            let location = NSEvent.mouseLocation
            if NSEvent.pressedMouseButtons & 1 == 0 {
                // Button released between drag events — end of a global drag.
                if isDragging { finalizeSelection(at: location) }
                return
            }
            guard event.modifierFlags.contains(.command) else { return }
            if dragStart == nil {
                beginDrag()
            }
            if isDragging {
                updateLiveRect(to: location)
            }
        case .keyDown:
            if event.keyCode == 53, selection != nil { // Escape
                clearSelection()
            }
        default:
            break
        }
    }

    // MARK: - Gesture state

    private func beginDrag() {
        isDragging = true
        dragStart = NSEvent.mouseLocation
        liveRect = nil
        // Replacing the previous selection.
        selection = nil
        selectionDisplayID = nil
        rebuildOverlayWindows()
    }

    private func updateLiveRect(to point: NSPoint) {
        guard let start = dragStart else { return }
        liveRect = normalizedRect(from: start, to: point)
        overlayWindows.forEach { $0.contentView?.needsDisplay = true }
    }

    private func finalizeSelection(at point: NSPoint) {
        guard let start = dragStart else {
            isDragging = false
            dragStart = nil
            liveRect = nil
            return
        }
        isDragging = false
        dragStart = nil
        liveRect = nil

        var rect = normalizedRect(from: start, to: point)
        guard rect.width >= 16, rect.height >= 16,
              let screen = NSScreen.screens.first(where: { $0.frame.contains(start) })
        else {
            // Too small to be a real selection (accidental click) — keep any
            // previous selection and its overlay.
            overlayWindows.forEach { $0.contentView?.needsDisplay = true }
            return
        }
        rect = rect.intersection(screen.frame)
        guard rect.width >= 16, rect.height >= 16 else { return }

        selection = rect
        selectionDisplayID = screen.displayID
        rebuildOverlayWindows()
        print("[ScreenSelection] Selected \(Int(rect.width))x\(Int(rect.height)) on display \(screen.displayID)")
    }

    private func normalizedRect(from a: NSPoint, to b: NSPoint) -> CGRect {
        CGRect(
            x: min(a.x, b.x),
            y: min(a.y, b.y),
            width: abs(a.x - b.x),
            height: abs(a.y - b.y)
        )
    }

    // MARK: - Overlay

    /// (Re)creates the dimming + selection overlay on every screen. Windows
    /// only exist while a selection is active or a drag is in progress.
    private func rebuildOverlayWindows() {
        overlayWindows.forEach { $0.orderOut(nil) }
        overlayWindows = []

        guard selection != nil || isDragging else { return }

        let finalized = selection
        let finalizedDisplayID = selectionDisplayID
        for screen in NSScreen.screens {
            let window = NSWindow(
                contentRect: screen.frame,
                styleMask: .borderless,
                backing: .buffered,
                defer: false
            )
            window.level = .screenSaver
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
            window.ignoresMouseEvents = true
            window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]

            let view = SelectionOverlayView(frame: NSRect(origin: .zero, size: screen.frame.size))
            view.screenFrame = screen.frame
            view.finalizedRect = finalized
            view.finalizedDisplayID = finalizedDisplayID
            view.liveRectProvider = { [weak self] in self?.liveRect }
            window.contentView = view
            window.orderFrontRegardless()
            overlayWindows.append(window)
        }
    }

    private func installObservers() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
                // Display layout changed — rebuild overlays for the new geometry.
                self?.rebuildOverlayWindows()
            },
        ]
    }
}

private extension NSScreen {
    var displayID: CGDirectDisplayID {
        deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
    }
}

/// Draws the dim + cut-out selection rectangle for one screen. Uses a live
/// rect (during drag) or the finalized rect (after release).
private final class SelectionOverlayView: NSView {
    var screenFrame: CGRect = .zero
    var finalizedRect: CGRect?
    var finalizedDisplayID: CGDirectDisplayID?
    /// Read live so the view always renders the current drag rect.
    var liveRectProvider: (() -> CGRect?)?

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        NSColor.black.withAlphaComponent(0.45).setFill()
        bounds.fill()

        let rect = liveRectProvider?() ?? finalizedRect
        guard let rect else { return }

        let local = NSRect(
            x: rect.minX - screenFrame.minX,
            y: rect.minY - screenFrame.minY,
            width: rect.width,
            height: rect.height
        )
        guard bounds.intersects(local) else { return }
        let clipped = bounds.intersection(local)

        // Cut out the selection so the real screen shows through.
        NSGraphicsContext.current?.compositingOperation = .clear
        NSBezierPath(roundedRect: clipped, xRadius: 8, yRadius: 8).fill()
        NSGraphicsContext.current?.compositingOperation = .sourceOver

        // White border around the selection.
        NSColor.white.withAlphaComponent(0.92).setStroke()
        let border = NSBezierPath(roundedRect: clipped.insetBy(dx: 1.5, dy: 1.5), xRadius: 7, yRadius: 7)
        border.lineWidth = 2
        border.stroke()

        // "✕" badge (finalized selection only) — hints Escape clears it.
        if finalizedRect != nil {
            let badgeSize: CGFloat = 22
            let badge = NSRect(
                x: clipped.maxX - badgeSize - 6,
                y: clipped.maxY + 6,
                width: badgeSize,
                height: badgeSize
            )
            let circle = NSBezierPath(ovalIn: badge)
            NSColor.black.withAlphaComponent(0.7).setFill()
            circle.fill()
            NSColor.white.withAlphaComponent(0.92).setStroke()
            circle.lineWidth = 1.5
            circle.stroke()
            NSColor.white.withAlphaComponent(0.92).setStroke()
            let inset = badge.insetBy(dx: 7, dy: 7)
            NSBezierPath.strokeLine(from: NSPoint(x: inset.minX, y: inset.minY), to: NSPoint(x: inset.maxX, y: inset.maxY))
            NSBezierPath.strokeLine(from: NSPoint(x: inset.maxX, y: inset.minY), to: NSPoint(x: inset.minX, y: inset.maxY))
        }
    }
}