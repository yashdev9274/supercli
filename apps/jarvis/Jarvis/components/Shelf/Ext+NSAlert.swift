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

import Cocoa

extension NSAlert {
    static func popError(_ error: String) {
        let alert = NSAlert()
        alert.messageText = NSLocalizedString("Error", comment: "")
        alert.alertStyle = .critical
        alert.informativeText = error
        alert.addButton(withTitle: NSLocalizedString("OK", comment: ""))
        alert.runModal()
    }

    static func popRestart(_ error: String, completion: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = NSLocalizedString("Need Restart", comment: "")
        alert.alertStyle = .critical
        alert.informativeText = error
        alert.addButton(withTitle: NSLocalizedString("Exit", comment: ""))
        alert.addButton(withTitle: NSLocalizedString("Later", comment: ""))
        let response = alert.runModal()
        if response == .alertFirstButtonReturn {
            completion()
        }
    }

    static func popError(_ error: Error) {
        popError(error.localizedDescription)
    }
}
