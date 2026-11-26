import Foundation

@MainActor
final class ExtensionLockScreenWidgetPresentationController {
    private unowned let manager: ExtensionLockScreenWidgetManager

    init(manager: ExtensionLockScreenWidgetManager) {
        self.manager = manager
    }
}
