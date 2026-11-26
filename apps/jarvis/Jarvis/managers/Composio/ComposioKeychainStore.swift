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
import Security

enum ComposioKeychainAccount: String {
    case apiKey = "composio-api-key"
}

protocol ComposioKeychainStoring: Sendable {
    func read(_ account: ComposioKeychainAccount) -> String?
    @discardableResult func write(_ value: String, account: ComposioKeychainAccount) -> OSStatus
    @discardableResult func delete(_ account: ComposioKeychainAccount) -> OSStatus
}

/// Keychain-backed storage for the Composio API key. The key never touches
/// UserDefaults, so it is never persisted in plaintext or synced by default.
struct KeychainComposioStore: ComposioKeychainStoring {
    private static let service = "com.Ebullioscopic.Atoll.Composio"

    private func baseQuery(for account: ComposioKeychainAccount) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account.rawValue
        ]
    }

    func read(_ account: ComposioKeychainAccount) -> String? {
        var query = baseQuery(for: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func write(_ value: String, account: ComposioKeychainAccount) -> OSStatus {
        let data = Data(value.utf8)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(baseQuery(for: account) as CFDictionary, update as CFDictionary)
        guard status == errSecItemNotFound else {
            return status
        }
        var attributes = baseQuery(for: account)
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(attributes as CFDictionary, nil)
    }

    @discardableResult
    func delete(_ account: ComposioKeychainAccount) -> OSStatus {
        let status = SecItemDelete(baseQuery(for: account) as CFDictionary)
        return status == errSecItemNotFound ? errSecSuccess : status
    }
}
