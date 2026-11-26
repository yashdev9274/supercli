/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
 *
 * Originally from boring.notch project
 * Modified and adapted for JARVIS (Jarvis)
 * See NOTICE for details.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import AppKit
import Combine
import SwiftUI

/// A click-through panel that follows the system cursor and renders the
/// voice conversation (same visual language as the Dynamic Island) right
/// above the pointer.
@MainActor
final class CursorCompanionManager {
    static let shared = CursorCompanionManager()

    private var window: CursorCompanionPanel?
    private var hostingView: NSHostingView<CursorCompanionView>?
    private var trackingTimer: Timer?
    private var cancellables = Set<AnyCancellable>()

    /// Current smoothed window position (in screen coordinates).
    private var currentPosition: CGPoint = .zero
    /// Raw cursor position from the latest tick.
    private var targetPosition: CGPoint = .zero

    /// Distance from the cursor point to the companion's top-left corner
    /// (it renders on the bottom-right side of the pointer).
    private let horizontalOffset: CGFloat = 16
    private let verticalOffset: CGFloat = 16
    /// Per-tick smoothing factor (0...1) applied at 120 Hz.
    private let smoothingFactor: CGFloat = 0.25
    private let trackInterval: TimeInterval = 1.0 / 120.0

    private init() {}

    func start() {
        guard window == nil else { return }

        let view = CursorCompanionView(voiceManager: VoiceAgentManager.shared)
        let hosting = NSHostingView(rootView: view)
        hostingView = hosting

        let panel = CursorCompanionPanel(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 260),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .mainMenu + 3
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.ignoresMouseEvents = true
        panel.contentView = hosting
        panel.orderFrontRegardless()
        window = panel

        ScreenCaptureVisibilityManager.shared.register(panel, scope: .entireInterface)

        targetPosition = NSEvent.mouseLocation
        currentPosition = targetPosition
        positionWindow(at: targetPosition)

        let timer = Timer(timeInterval: trackInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        trackingTimer = timer

        observeVoiceState()
    }

    private func tick() {
        guard let window else { return }
        let mouse = NSEvent.mouseLocation

        targetPosition = mouse
        currentPosition.x += (targetPosition.x - currentPosition.x) * smoothingFactor
        currentPosition.y += (targetPosition.y - currentPosition.y) * smoothingFactor

        positionWindow(at: currentPosition)
    }

    private func positionWindow(at point: CGPoint) {
        guard let window, let hostingView else { return }

        let fitting = hostingView.fittingSize
        let width = max(fitting.width, 20)
        let height = max(fitting.height, 20)

        var origin = NSPoint(
            x: point.x + horizontalOffset,
            y: point.y - height - verticalOffset
        )

        // Clamp to the visible screen so the companion never goes off-screen;
        // flip to the other side of the cursor when it would.
        if let screen = NSScreen.screenWithMouse {
            let frame = screen.frame
            let minX = frame.minX + 8
            let maxX = frame.maxX - width - 8
            let minY = frame.minY + 8
            let maxY = frame.maxY - height - 8

            if maxX < minX {
                origin.x = frame.midX - width / 2
            } else if origin.x > maxX {
                origin.x = point.x - width - horizontalOffset
            }
            origin.x = min(max(origin.x, minX), maxX)

            if maxY < minY {
                origin.y = frame.minY + 8
            } else if origin.y < minY {
                origin.y = point.y + verticalOffset
            }
            origin.y = min(max(origin.y, minY), maxY)
        }

        window.setFrame(NSRect(origin: origin, size: NSSize(width: width, height: height)), display: true)
    }

    /// Resize/keep the panel in sync with voice activity: show the
    /// conversation bubble while visible, the globe when idle.
    private func observeVoiceState() {
        VoiceAgentManager.shared.$isConversationVisible
            .receive(on: RunLoop.main)
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.positionWindow(at: self?.targetPosition ?? NSEvent.mouseLocation)
                }
            }
            .store(in: &cancellables)
    }

    func stop() {
        trackingTimer?.invalidate()
        trackingTimer = nil
        window?.orderOut(nil)
        window = nil
        hostingView = nil
        cancellables.removeAll()
    }
}

/// Borderless, click-through panel that hosts the cursor companion.
private final class CursorCompanionPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
