/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
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

import SwiftUI
import Defaults

#if canImport(AppKit)
import AppKit

// MARK: - Trackpad scroll monitor (NSEvent local monitor — NSView.scrollWheel is not
// delivered when SwiftUI layers sit above the representable)

private struct RulerScrollMonitor: NSViewRepresentable {
    let onScroll: (CGFloat) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        context.coordinator.installMonitor(on: view)
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        context.coordinator.onScroll = onScroll
    }

    static func dismantleNSView(_ nsView: NSView, coordinator: Coordinator) {
        coordinator.removeMonitor()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onScroll: onScroll)
    }

    @MainActor
    final class Coordinator: NSObject {
        var onScroll: (CGFloat) -> Void
        private var monitor: Any?
        private weak var observedView: NSView?
        private var lastEventTimestamp: TimeInterval = 0

        init(onScroll: @escaping (CGFloat) -> Void) {
            self.onScroll = onScroll
        }

        func installMonitor(on view: NSView) {
            removeMonitor()
            observedView = view
            monitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
                guard let self else { return event }
                guard self.shouldHandle(event, view: view) else { return event }
                self.onScroll(event.scrollingDeltaX)
                return nil
            }
        }

        func removeMonitor() {
            if let monitor {
                NSEvent.removeMonitor(monitor)
                self.monitor = nil
            }
            observedView = nil
            lastEventTimestamp = 0
        }

        private func shouldHandle(_ event: NSEvent, view: NSView) -> Bool {
            guard lastEventTimestamp != event.timestamp else { return false }
            lastEventTimestamp = event.timestamp
            guard isCursorOverView(view) else { return false }

            let deltaX = event.scrollingDeltaX
            let deltaY = event.scrollingDeltaY
            guard abs(deltaX) > abs(deltaY), abs(deltaX) > 0.15 else { return false }

            let phase = event.phase
            let momentum = event.momentumPhase
            guard phase != [] || momentum != [] else { return false }
            return true
        }

        private func isCursorOverView(_ view: NSView) -> Bool {
            guard let window = view.window else { return false }
            let screenPoint = NSEvent.mouseLocation
            let windowPoint = window.convertPoint(fromScreen: screenPoint)
            let localPoint = view.convert(windowPoint, from: nil)
            return view.bounds.contains(localPoint)
        }
    }
}

// MARK: - Haptic

private func triggerHaptic() {
    NSHapticFeedbackManager.defaultPerformer.perform(
        .alignment,
        performanceTime: .now
    )
}
#endif

// MARK: - RulerTimerPicker

struct RulerTimerPicker: View {
    @EnvironmentObject private var vm: JarvisViewModel

    @Binding var hours: Int
    @Binding var minutes: Int
    @Binding var seconds: Int
    let tintColor: Color
    let startAction: () -> Void

    // Raw continuous value for smooth dragging
    @State private var totalMinutes: Double = 10.0
    @State private var dragStartValue: Double = 10.0
    @State private var isDragging = false
    @State private var lastHapticMinute: Int = -1
    @State private var isSuppressingScrollGestures = false
    private let scrollSuppressionToken = UUID()

    private let range: ClosedRange<Double> = 0...90
    private let tickSpacing: CGFloat = 10   // px per minute
    private let fadeWidth: CGFloat = 48     // width of edge fade

    var body: some View {
        VStack(spacing: 0) {
            rulerArea
            controlRow
        }
        .onAppear { syncFromBindings() }
        .onChange(of: hours)   { _, _ in syncFromBindings() }
        .onChange(of: minutes) { _, _ in syncFromBindings() }
        .onChange(of: seconds) { _, _ in syncFromBindings() }
        .onChange(of: totalMinutes) { _, newVal in
            let rounded = Int(newVal.rounded())
            hours   = rounded / 60
            minutes = rounded % 60
            seconds = 0
            fireHapticIfNeeded(roundedMinute: rounded)
        }
    }

    // MARK: Ruler

    private var rulerArea: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let mid   = width / 2

            ZStack(alignment: .top) {
                // ── tick marks and labels ──
                Canvas { ctx, size in
                    let centerX = size.width / 2
                    let currentMinutes = totalMinutes

                    let span = Int(ceil((size.width / 2) / tickSpacing)) + 3
                    let start = max(0, Int(currentMinutes) - span)
                    let end   = min(90, Int(currentMinutes) + span)

                    for m in start...end {
                        let x = centerX + CGFloat(Double(m) - currentMinutes) * tickSpacing
                        let isMajor = (m % 5 == 0)

                        // tick
                        let tickH: CGFloat = isMajor ? 20 : 12
                        let tickW: CGFloat = isMajor ? 2 : 1.5
                        let opacity: Double = isMajor ? 0.9 : 0.5
                        let rect = CGRect(
                            x: x - tickW / 2,
                            y: isMajor ? 16 : 20,
                            width: tickW,
                            height: tickH
                        )
                        ctx.fill(
                            Path(roundedRect: rect, cornerRadius: 1),
                            with: .color(tintColor.opacity(opacity))
                        )

                        // label every 5 minutes
                        if isMajor {
                            let str = "\(m)"
                            let resolved = ctx.resolve(
                                Text(str)
                                    .font(.system(size: 11, weight: .bold, design: .rounded))
                                    .foregroundColor(tintColor.opacity(0.85))
                            )
                            let textSize = resolved.measure(in: CGSize(width: 40, height: 20))
                            ctx.draw(resolved, at: CGPoint(x: x, y: 6), anchor: .center)
                            _ = textSize
                        }
                    }
                }
                .frame(height: 52)

                // ── pointer triangle ──
                Image(systemName: "arrowtriangle.up.fill")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(tintColor)
                    .frame(width: width)
                    .offset(y: 48)

                // ── drag gesture overlay ──
                Color.clear
                    .frame(width: width, height: 60)
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 2)
                            .onChanged { value in
                                if !isDragging {
                                    isDragging = true
                                    dragStartValue = totalMinutes
                                }
                                let change = Double(-value.translation.width) / Double(tickSpacing)
                                var next = dragStartValue + change
                                next = min(max(range.lowerBound, next), range.upperBound)
                                totalMinutes = next
                            }
                            .onEnded { _ in
                                isDragging = false
                                withAnimation(.smooth(duration: 0.15)) {
                                    totalMinutes = totalMinutes.rounded()
                                }
                            }
                    )
            }
            // ── edge fade mask ──
            .mask(
                HStack(spacing: 0) {
                    LinearGradient(
                        colors: [.clear, .black],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: fadeWidth)

                    Rectangle()
                        .frame(maxWidth: .infinity)

                    LinearGradient(
                        colors: [.black, .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: fadeWidth)
                }
            )
#if canImport(AppKit)
            .background {
                RulerScrollMonitor { delta in
                    applyTrackpadScroll(delta)
                }
            }
#endif
            .onHover { hovering in
                updateScrollGestureSuppression(hovering)
            }
        }
        .frame(height: 62)
        .onDisappear {
            updateScrollGestureSuppression(false)
        }
    }

    // MARK: Control row

    private var controlRow: some View {
        HStack(alignment: .center, spacing: 0) {
            // Start Timer pill button — style matches the screenshot
            Button(action: {
                guard totalMinutes.rounded() > 0 else { return }
                startAction()
            }) {
                Text(String(localized: "Start Timer"))
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(tintColor)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(tintColor.opacity(0.18))
                    )
                    .overlay(
                        Capsule()
                            .stroke(tintColor.opacity(0.25), lineWidth: 1.5)
                    )
            }
            .buttonStyle(.plain)
            .opacity(totalMinutes.rounded() == 0 ? 0.45 : 1.0)
            .disabled(totalMinutes.rounded() == 0)

            Spacer()

            // Large time readout
            Text(formattedDisplayTime)
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(tintColor)
                .contentTransition(.numericText())
                .animation(.smooth(duration: 0.12), value: Int(totalMinutes.rounded()))
        }
        .padding(.horizontal, 6)
        .padding(.top, 14)
    }

    // MARK: Helpers

#if canImport(AppKit)
    private func applyTrackpadScroll(_ delta: CGFloat) {
        // scrollingDeltaX: positive = right; invert so scrolling right increases time
        let change = Double(-delta) / Double(tickSpacing)
        var next = totalMinutes + change
        next = min(max(range.lowerBound, next), range.upperBound)
        totalMinutes = next
    }

    private func updateScrollGestureSuppression(_ hovering: Bool) {
        guard hovering != isSuppressingScrollGestures else { return }
        isSuppressingScrollGestures = hovering
        vm.setScrollGestureSuppression(hovering, token: scrollSuppressionToken)
    }
#endif

    private func syncFromBindings() {
        guard !isDragging else { return }
        let newTotal = Double(hours * 60 + minutes)
        if abs(totalMinutes - newTotal) > 0.01 {
            totalMinutes = newTotal
        }
    }

    private func fireHapticIfNeeded(roundedMinute: Int) {
#if canImport(AppKit)
        if roundedMinute != lastHapticMinute {
            lastHapticMinute = roundedMinute
            triggerHaptic()
        }
#endif
    }

    private var formattedDisplayTime: String {
        let m = Int(totalMinutes.rounded())
        let hrs  = m / 60
        let mins = m % 60
        if hrs > 0 {
            return String(format: "%d:%02d:00", hrs, mins)
        } else {
            return String(format: "%02d:00", mins)
        }
    }
}
