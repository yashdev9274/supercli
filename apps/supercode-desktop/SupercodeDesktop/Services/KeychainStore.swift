import Foundation
import LocalAuthentication
import Security

/// Auth credential storage that does **not** prompt for the macOS login password.
///
/// Debug / ad-hoc signed builds re-sign on every run, so classic Keychain items
/// become ACL-orphaned and macOS shows a system password dialog on access.
/// Tokens therefore live in Application Support (POSIX 0600). Non-secrets use
/// UserDefaults. A one-shot silent Keychain read migrates any pre-existing items.
enum KeychainStore {
    static let service = "ai.supercode.desktop.auth"

    enum Key: String, CaseIterable {
        case accessToken
        case refreshToken
        case tokenType
        case expiresAt
        case serverURL
        case clientID
    }

    private static let userDefaultsKeys: Set<Key> = [.serverURL, .clientID]
    private static let fileKeys: Set<Key> = [.accessToken, .refreshToken, .tokenType, .expiresAt]
    private static let defaultsPrefix = "ai.supercode.desktop."
    private static let migrationFlag = "ai.supercode.desktop.creds.file.migrated.v1"
    private static let queue = DispatchQueue(label: "ai.supercode.desktop.credentials")

    // MARK: - Public API

    static func set(_ value: String, for key: Key) {
        if userDefaultsKeys.contains(key) {
            UserDefaults.standard.set(value, forKey: defaultsKey(key))
            // Also keep the short key used by AppSessionStore.
            if key == .serverURL {
                UserDefaults.standard.set(value, forKey: "serverURL")
            }
            return
        }

        queue.sync {
            var store = loadFileStore()
            store[key.rawValue] = value
            saveFileStore(store)
        }
    }

    static func get(_ key: Key) -> String? {
        migrateFromKeychainIfNeeded()

        if userDefaultsKeys.contains(key) {
            if let value = UserDefaults.standard.string(forKey: defaultsKey(key)), !value.isEmpty {
                return value
            }
            if key == .serverURL,
               let value = UserDefaults.standard.string(forKey: "serverURL"),
               !value.isEmpty {
                return value
            }
            return nil
        }

        return queue.sync {
            loadFileStore()[key.rawValue]
        }
    }

    static func delete(_ key: Key) {
        if userDefaultsKeys.contains(key) {
            UserDefaults.standard.removeObject(forKey: defaultsKey(key))
            if key == .serverURL {
                UserDefaults.standard.removeObject(forKey: "serverURL")
            }
        }
        if fileKeys.contains(key) {
            queue.sync {
                var store = loadFileStore()
                store.removeValue(forKey: key.rawValue)
                saveFileStore(store)
            }
        }
        // Best-effort silent Keychain cleanup (never prompts).
        deleteKeychainSilently(key)
    }

    static func clearAuth() {
        delete(.accessToken)
        delete(.refreshToken)
        delete(.tokenType)
        delete(.expiresAt)
    }

    static func resetAll() {
        for key in Key.allCases {
            delete(key)
        }
        try? FileManager.default.removeItem(at: credentialsURL())
    }

    // MARK: - File store

    private static func defaultsKey(_ key: Key) -> String {
        defaultsPrefix + key.rawValue
    }

    private static func supportDirectory() -> URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        let dir = base.appendingPathComponent("SupercodeDesktop", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private static func credentialsURL() -> URL {
        supportDirectory().appendingPathComponent("credentials.json")
    }

    private static func loadFileStore() -> [String: String] {
        let url = credentialsURL()
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String]
        else { return [:] }
        return obj
    }

    private static func saveFileStore(_ store: [String: String]) {
        let url = credentialsURL()
        if store.isEmpty {
            try? FileManager.default.removeItem(at: url)
            return
        }
        guard let data = try? JSONSerialization.data(withJSONObject: store, options: [.prettyPrinted]) else { return }
        try? data.write(to: url, options: [.atomic])
        // Restrict to current user only.
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }

    // MARK: - One-shot silent Keychain → file migration

    private static func migrateFromKeychainIfNeeded() {
        guard !UserDefaults.standard.bool(forKey: migrationFlag) else { return }
        UserDefaults.standard.set(true, forKey: migrationFlag)

        for key in Key.allCases {
            if let value = readKeychainSilently(key) {
                set(value, for: key)
            }
            deleteKeychainSilently(key)
        }
    }

    private static func noInteractionContext() -> LAContext {
        let context = LAContext()
        context.interactionNotAllowed = true
        return context
    }

    private static func readKeychainSilently(_ key: Key) -> String? {
        for useDP in [true, false] {
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key.rawValue,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
                kSecUseAuthenticationContext as String: noInteractionContext(),
            ]
            if useDP {
                query[kSecUseDataProtectionKeychain as String] = true
            }
            var item: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &item)
            if status == errSecSuccess, let data = item as? Data,
               let value = String(data: data, encoding: .utf8), !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private static func deleteKeychainSilently(_ key: Key) {
        for useDP in [true, false] {
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key.rawValue,
                kSecUseAuthenticationContext as String: noInteractionContext(),
            ]
            if useDP {
                query[kSecUseDataProtectionKeychain as String] = true
            }
            SecItemDelete(query as CFDictionary)
        }
    }
}
