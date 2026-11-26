import Foundation
import AppKit

@MainActor
final class LocalSendDevicePickerWindowManager {
    static let shared = LocalSendDevicePickerWindowManager()
    private init() {}

    func show(onDeviceSelected: @escaping (LocalSendDevice) -> Void, onDismiss: @escaping () -> Void) {
        // Stub: LocalSend discovery not implemented yet
    }

    func hide() {
        // Stub
    }
}

struct LocalSendDevice {
    let id: String
    let name: String
}
