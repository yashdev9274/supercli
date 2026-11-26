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
import Combine
import Defaults

enum ScreenCaptureScope: Int {
    case panelsOnly
    case entireInterface
}

final class ScreenCaptureVisibilityManager {
    static let shared = ScreenCaptureVisibilityManager()

    private let scopedWindows = NSMapTable<NSWindow, NSNumber>(keyOptions: .weakMemory, valueOptions: .strongMemory)
    private var cancellables = Set<AnyCancellable>()

    private init() {
        let interfacePublisher = Defaults.publisher(.hideJarvisFromScreenCapture)
            .map { _ in () }
            .eraseToAnyPublisher()

        interfacePublisher
            .receive(on: RunLoop.main)
            .sink { [weak self] in
                self?.updateAllWindows()
            }
            .store(in: &cancellables)
    }

    func register(_ window: NSWindow, scope: ScreenCaptureScope) {
        scopedWindows.setObject(NSNumber(value: scope.rawValue), forKey: window)
        applyVisibility(to: window, scope: scope)
    }

    func unregister(_ window: NSWindow) {
        scopedWindows.removeObject(forKey: window)
    }

    private func updateAllWindows() {
        guard let windows = scopedWindows.keyEnumerator().allObjects as? [NSWindow] else { return }
        for window in windows {
            guard let raw = scopedWindows.object(forKey: window)?.intValue,
                  let scope = ScreenCaptureScope(rawValue: raw) else { continue }
            applyVisibility(to: window, scope: scope)
        }
    }

    private func applyVisibility(to window: NSWindow, scope _: ScreenCaptureScope) {
        let shouldHide = Defaults[.hideJarvisFromScreenCapture]
        window.sharingType = shouldHide ? .none : .readOnly
    }
}
