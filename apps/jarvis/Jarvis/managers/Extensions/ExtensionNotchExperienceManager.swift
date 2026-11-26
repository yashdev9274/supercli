import Foundation
import Defaults
import SwiftUI
import AtollExtensionKit

@MainActor
final class ExtensionNotchExperienceManager: ObservableObject {
    static let shared = ExtensionNotchExperienceManager()
    @Published private(set) var activeExperiences: [ExtensionNotchExperiencePayload] = []
    private init() {}

    func present(descriptor: AtollNotchExperienceDescriptor, bundleIdentifier: String) throws {
        let payload = ExtensionNotchExperiencePayload(
            bundleIdentifier: bundleIdentifier,
            descriptor: descriptor,
            receivedAt: .now
        )
        if let index = activeExperiences.firstIndex(where: { $0.descriptor.id == descriptor.id && $0.bundleIdentifier == bundleIdentifier }) {
            activeExperiences[index] = payload
        } else {
            activeExperiences.append(payload)
        }
    }

    func update(descriptor: AtollNotchExperienceDescriptor, bundleIdentifier: String) throws {
        guard let index = activeExperiences.firstIndex(where: { $0.descriptor.id == descriptor.id && $0.bundleIdentifier == bundleIdentifier }) else {
            throw ExtensionValidationError.invalidDescriptor("Missing existing experience")
        }
        let payload = ExtensionNotchExperiencePayload(
            bundleIdentifier: bundleIdentifier,
            descriptor: descriptor,
            receivedAt: activeExperiences[index].receivedAt
        )
        activeExperiences[index] = payload
    }

    func dismiss(experienceID: String, bundleIdentifier: String) {
        activeExperiences.removeAll { $0.descriptor.id == experienceID && $0.bundleIdentifier == bundleIdentifier }
    }

    func payload(experienceID: String) -> ExtensionNotchExperiencePayload? {
        activeExperiences.first { $0.descriptor.id == experienceID }
    }

    func highestPriorityTabPayload() -> ExtensionNotchExperiencePayload? {
        activeExperiences
            .filter { $0.hasTabConfiguration }
            .sorted { $0.priority > $1.priority }
            .first
    }

    func minimalisticReplacementPayload() -> ExtensionNotchExperiencePayload? {
        activeExperiences
            .filter { $0.hasMinimalisticConfiguration }
            .sorted { $0.priority > $1.priority }
            .first
    }
}
