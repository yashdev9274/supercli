import Foundation
import Combine
import AppKit

@MainActor
final class SiriVisibilityMonitor: ObservableObject {
    static let shared = SiriVisibilityMonitor()
    private init() {}

    func autohide(_ window: NSWindow?, cancellables: inout Set<AnyCancellable>) {
        // No-op stub
    }
}
