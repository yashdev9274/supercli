import Foundation
import AppKit

@MainActor
final class LockScreenWeatherPanelManager {
    static let shared = LockScreenWeatherPanelManager()
    private(set) var latestFrame: NSRect?
    private init() {}

    func update(with snapshot: LockScreenWeatherSnapshot) {
        // No-op stub
    }

    func hide() {
        // No-op stub
    }

    func show(with snapshot: LockScreenWeatherSnapshot) {
        // No-op stub
    }
}
