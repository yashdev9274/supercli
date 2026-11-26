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

import AppKit
import Foundation
import Defaults
import AtollExtensionKit

@MainActor
final class ExtensionXPCService: NSObject, @preconcurrency AtollXPCServiceProtocol {
    private let bundleIdentifier: String
    private weak var host: ExtensionXPCServiceHost?
    private weak var connection: NSXPCConnection?

    private let authorizationManager = ExtensionAuthorizationManager.shared
    private let liveActivityManager = ExtensionLiveActivityManager.shared
    private let widgetManager = ExtensionLockScreenWidgetManager.shared
    private let notchExperienceManager = ExtensionNotchExperienceManager.shared
    private let decoder = JSONDecoder()

    init(bundleIdentifier: String, host: ExtensionXPCServiceHost, connection: NSXPCConnection) {
        self.bundleIdentifier = bundleIdentifier
        self.host = host
        self.connection = connection
        super.init()
    }

    // MARK: Authorization

    func requestAuthorization(bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool, Error?) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard self.validate(bundleIdentifier: providedBundleIdentifier, reply: reply) else { return }

            guard self.authorizationManager.isExtensionsFeatureEnabled else {
                reply(false, ExtensionValidationError.featureDisabled.asNSError)
                return
            }

            let entry = self.authorizationManager.ensureEntryExists(bundleIdentifier: self.bundleIdentifier, appName: self.resolvedApplicationName())

            if entry.status == .pending {
                self.authorizationManager.authorize(bundleIdentifier: self.bundleIdentifier, appName: self.resolvedApplicationName())
                self.host?.notifyAuthorizationChange(bundleIdentifier: self.bundleIdentifier, isAuthorized: true)
                reply(true, nil)
                return
            }

            reply(entry.isAuthorized, entry.isAuthorized ? nil : ExtensionValidationError.unauthorized.asNSError)
        }
    }

    func checkAuthorization(bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard providedBundleIdentifier == self.bundleIdentifier else {
                reply(false)
                return
            }

            let isAuthorized = self.authorizationManager.authorizationEntry(for: self.bundleIdentifier)?.isAuthorized ?? false
            reply(isAuthorized)
        }
    }

    // MARK: Live Activities

    func presentLiveActivity(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollLiveActivityDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received live activity payload from \(service.bundleIdentifier) (id: \(descriptor.id), priority: \(descriptor.priority.rawValue), coexistence: \(descriptor.allowsMusicCoexistence))")
            try service.liveActivityManager.present(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Live activity \(descriptor.id) stored for \(service.bundleIdentifier); active activities: \(service.liveActivityManager.activeActivities.count)")
        }
    }

    func updateLiveActivity(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollLiveActivityDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received live activity update from \(service.bundleIdentifier) (id: \(descriptor.id))")
            try service.liveActivityManager.update(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Live activity \(descriptor.id) updated for \(service.bundleIdentifier)")
        }
    }

    func dismissLiveActivity(activityID: String, bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool, Error?) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard self.validate(bundleIdentifier: providedBundleIdentifier, reply: reply) else { return }

            self.logDiagnostics("Received live activity dismissal from \(self.bundleIdentifier) (id: \(activityID))")
            self.liveActivityManager.dismiss(activityID: activityID, bundleIdentifier: self.bundleIdentifier)
            self.logDiagnostics("Live activity \(activityID) dismissed for \(self.bundleIdentifier)")
            reply(true, nil)
        }
    }

    // MARK: Lock Screen Widgets

    func presentLockScreenWidget(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollLockScreenWidgetDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received lock screen widget payload from \(service.bundleIdentifier) (id: \(descriptor.id), style: \(descriptor.layoutStyle))")
            try service.widgetManager.present(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Lock screen widget \(descriptor.id) stored for \(service.bundleIdentifier); active widgets: \(service.widgetManager.activeWidgets.count)")
        }
    }

    func updateLockScreenWidget(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollLockScreenWidgetDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received lock screen widget update from \(service.bundleIdentifier) (id: \(descriptor.id))")
            try service.widgetManager.update(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Lock screen widget \(descriptor.id) updated for \(service.bundleIdentifier)")
        }
    }

    func dismissLockScreenWidget(widgetID: String, bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool, Error?) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard self.validate(bundleIdentifier: providedBundleIdentifier, reply: reply) else { return }

            self.logDiagnostics("Received lock screen widget dismissal from \(self.bundleIdentifier) (id: \(widgetID))")
            self.widgetManager.dismiss(widgetID: widgetID, bundleIdentifier: self.bundleIdentifier)
            self.logDiagnostics("Lock screen widget \(widgetID) dismissed for \(self.bundleIdentifier)")
            reply(true, nil)
        }
    }

    // MARK: Notch Experiences

    func presentNotchExperience(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollNotchExperienceDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received notch experience payload from \(service.bundleIdentifier) (id: \(descriptor.id), priority: \(descriptor.priority.rawValue))")
            try service.notchExperienceManager.present(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Notch experience \(descriptor.id) stored for \(service.bundleIdentifier); active experiences: \(service.notchExperienceManager.activeExperiences.count)")
        }
    }

    func updateNotchExperience(descriptorData: Data, reply: @escaping (Bool, Error?) -> Void) {
        respond(reply: reply) { service in
            let descriptor = try service.decoder.decode(AtollNotchExperienceDescriptor.self, from: descriptorData)
            try ExtensionDescriptorValidator.validate(descriptor)
            service.logDiagnostics("Received notch experience update from \(service.bundleIdentifier) (id: \(descriptor.id))")
            try service.notchExperienceManager.update(descriptor: descriptor, bundleIdentifier: service.bundleIdentifier)
            service.logDiagnostics("Notch experience \(descriptor.id) updated for \(service.bundleIdentifier)")
        }
    }

    func dismissNotchExperience(experienceID: String, bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool, Error?) -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard self.validate(bundleIdentifier: providedBundleIdentifier, reply: reply) else { return }

            self.logDiagnostics("Received notch experience dismissal from \(self.bundleIdentifier) (id: \(experienceID))")
            self.notchExperienceManager.dismiss(experienceID: experienceID, bundleIdentifier: self.bundleIdentifier)
            self.logDiagnostics("Notch experience \(experienceID) dismissed for \(self.bundleIdentifier)")
            reply(true, nil)
        }
    }

    // MARK: Diagnostics

    func getVersion(reply: @escaping (String) -> Void) {
        Task { @MainActor in
            reply(appVersion)
        }
    }

    // MARK: Helpers

    private func respond(reply: @escaping (Bool, Error?) -> Void, operation: @escaping (ExtensionXPCService) throws -> Void) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try operation(self)
                reply(true, nil)
            } catch {
                if Defaults[.extensionDiagnosticsLoggingEnabled] {
                    Logger.log("Extension XPC request failed: \(error)", category: .extensions)
                }
                reply(false, error.asNSError)
            }
        }
    }

    private func validate(bundleIdentifier providedBundleIdentifier: String, reply: @escaping (Bool, Error?) -> Void) -> Bool {
        guard providedBundleIdentifier == bundleIdentifier else {
            let error = ExtensionXPCServiceError.bundleMismatch(expected: bundleIdentifier, received: providedBundleIdentifier)
            logDiagnostics("Rejected XPC request due to bundle mismatch. Expected \(bundleIdentifier) received \(providedBundleIdentifier)")
            reply(false, error.asNSError)
            return false
        }
        return true
    }

    private func logDiagnostics(_ message: String) {
        guard Defaults[.extensionDiagnosticsLoggingEnabled] else { return }
        Logger.log(message, category: .extensions)
    }

    private func resolvedApplicationName() -> String {
        guard let processIdentifier = connection?.processIdentifier,
              processIdentifier != 0,
              let app = NSRunningApplication(processIdentifier: pid_t(processIdentifier)),
              let name = app.localizedName else {
            return bundleIdentifier
        }
        return name
    }
}

private enum ExtensionXPCServiceError: LocalizedError {
    case bundleMismatch(expected: String, received: String)

    var errorDescription: String? {
        switch self {
        case let .bundleMismatch(expected, received):
            return "Bundle identifier mismatch. Expected \(expected) but received \(received)."
        }
    }
}

private extension Error {
    var asNSError: NSError { self as NSError }
}
