/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
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

/// Compiled-in credentials so the Integrations tab works out of the box.
///
/// The embedded key lets any user connect apps through Composio OAuth
/// without entering a key. The Keychain entry (if present) overrides it —
/// see `ComposioManager.apiKey`.
enum ComposioCredentials {
    static let embeddedAPIKey = "ak_1Zr3ac1-Taf5MgstuvNB"
}
