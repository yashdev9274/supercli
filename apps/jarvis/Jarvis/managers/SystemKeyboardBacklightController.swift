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

extension Notification.Name {
    static let keyboardBacklightDidChange = Notification.Name("DynamicIsland.keyboardBacklightDidChange")
}

final class SystemKeyboardBacklightController {
    static let shared = SystemKeyboardBacklightController()

    var onBacklightChange: ((Float) -> Void)?

    private let workerQueue = DispatchQueue(label: "com.atoll.keyboardBacklight", qos: .userInitiated)
    private let notificationCenter = NotificationCenter.default
    private var isRunning = false

    private init() {}

    func start() {
        guard !isRunning else { return }
        isRunning = true
        notifyCurrentLevel()
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
    }

    func adjust(by delta: Float) {
        let target = currentLevel + delta
        setLevel(target)
    }

    func setLevel(_ value: Float) {
        let clamped = max(0, min(1, value))
        workerQueue.async {
            do {
                try KeyboardBrightnessSensor.setLevel(clamped)
                let level = (try? KeyboardBrightnessSensor.currentLevel()) ?? clamped
                self.emitChange(level: level)
            } catch {
                NSLog("⚠️ Failed to set keyboard backlight: \(error)")
            }
        }
    }

    var currentLevel: Float {
        (try? KeyboardBrightnessSensor.currentLevel()) ?? 0
    }

    private func notifyCurrentLevel() {
        workerQueue.async {
            let level = (try? KeyboardBrightnessSensor.currentLevel()) ?? 0
            self.emitChange(level: level)
        }
    }

    private func emitChange(level: Float) {
        guard isRunning else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isRunning else { return }
            self.onBacklightChange?(level)
            self.notificationCenter.post(name: .keyboardBacklightDidChange, object: nil, userInfo: ["value": level])
        }
    }
}
