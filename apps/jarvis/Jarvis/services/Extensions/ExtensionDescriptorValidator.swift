import Foundation
import AtollExtensionKit

enum ExtensionDescriptorValidator {
    static func validate(_ descriptor: AtollLiveActivityDescriptor) throws {
        guard !descriptor.id.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty activity ID")
        }
        guard !descriptor.bundleIdentifier.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty bundle identifier")
        }
    }

    static func validate(_ descriptor: AtollLockScreenWidgetDescriptor) throws {
        guard !descriptor.id.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty widget ID")
        }
        guard !descriptor.bundleIdentifier.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty bundle identifier")
        }
    }

    static func validate(_ descriptor: AtollNotchExperienceDescriptor) throws {
        guard !descriptor.id.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty experience ID")
        }
        guard !descriptor.bundleIdentifier.isEmpty else {
            throw ExtensionValidationError.invalidDescriptor("Empty bundle identifier")
        }
    }
}
