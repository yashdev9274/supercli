import Foundation
import Defaults
import SwiftUI
import AtollExtensionKit

@MainActor
final class ExtensionLockScreenWidgetManager: ObservableObject {
    static let shared = ExtensionLockScreenWidgetManager()
    @Published private(set) var activeWidgets: [ExtensionLockScreenWidgetPayload] = []
    private init() {}

    func present(descriptor: AtollLockScreenWidgetDescriptor, bundleIdentifier: String) throws {
        let payload = ExtensionLockScreenWidgetPayload(
            bundleIdentifier: bundleIdentifier,
            descriptor: descriptor,
            receivedAt: .now
        )
        if let index = activeWidgets.firstIndex(where: { $0.descriptor.id == descriptor.id && $0.bundleIdentifier == bundleIdentifier }) {
            activeWidgets[index] = payload
        } else {
            activeWidgets.append(payload)
        }
    }

    func update(descriptor: AtollLockScreenWidgetDescriptor, bundleIdentifier: String) throws {
        guard let index = activeWidgets.firstIndex(where: { $0.descriptor.id == descriptor.id && $0.bundleIdentifier == bundleIdentifier }) else {
            throw ExtensionValidationError.invalidDescriptor("Missing existing widget")
        }
        let payload = ExtensionLockScreenWidgetPayload(
            bundleIdentifier: bundleIdentifier,
            descriptor: descriptor,
            receivedAt: activeWidgets[index].receivedAt
        )
        activeWidgets[index] = payload
    }

    func dismiss(widgetID: String, bundleIdentifier: String) {
        activeWidgets.removeAll { $0.descriptor.id == widgetID && $0.bundleIdentifier == bundleIdentifier }
    }
}
