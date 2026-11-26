import Foundation
import AppKit

struct LockScreenDisplayContext {
    var screen: NSScreen?
}

@MainActor
final class LockScreenDisplayContextProvider {
    static let shared = LockScreenDisplayContextProvider()
    private init() {}

    func refresh(reason: String) {
        // No-op stub
    }

    func contextSnapshot() -> LockScreenDisplayContext? {
        LockScreenDisplayContext(screen: NSScreen.main)
    }
}
