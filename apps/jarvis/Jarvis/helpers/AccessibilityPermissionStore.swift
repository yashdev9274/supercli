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

import Foundation
import Combine
import AppKit
#if canImport(ApplicationServices)
import ApplicationServices
#endif

/// Tracks accessibility permission status and exposes helpers to request access.
@MainActor
final class AccessibilityPermissionStore: ObservableObject {
    static let shared = AccessibilityPermissionStore()

    @Published private(set) var isAuthorized: Bool = AccessibilityPermissionStore.isAccessibilityAuthorized()

    private var pollingTask: Task<Void, Never>?

    private init() {}

    deinit {
        pollingTask?.cancel()
    }

    func refreshStatus() {
        updateAuthorizationStatus(to: Self.isAccessibilityAuthorized())
    }

    func requestAuthorizationPrompt() {
#if canImport(ApplicationServices)
        let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options: CFDictionary = [promptKey: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(options)
#endif
        beginPollingForStatusChanges()
    }

    func openSystemSettings() {
#if os(macOS)
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
#endif
    }

    private func beginPollingForStatusChanges() {
        pollingTask?.cancel()
        pollingTask = Task { [weak self] in
            for _ in 0..<30 {
                try? await Task.sleep(nanoseconds: 500_000_000)
                let status = Self.isAccessibilityAuthorized()
                await MainActor.run {
                    guard let self else { return }
                    self.updateAuthorizationStatus(to: status)
                }
                if status {
                    break
                }
            }
        }
    }

    private func updateAuthorizationStatus(to newValue: Bool) {
        guard newValue != isAuthorized else { return }
        isAuthorized = newValue
        if !newValue {
            beginPollingForStatusChanges()
        }
    }

    private static func isAccessibilityAuthorized() -> Bool {
#if canImport(ApplicationServices)
        if AppRuntimeEnvironment.isUITesting {
            return true
        }
        return AXIsProcessTrusted()
#else
        return true
#endif
    }
}
