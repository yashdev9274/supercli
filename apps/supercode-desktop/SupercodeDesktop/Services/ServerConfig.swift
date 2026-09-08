import Foundation

/// Canonical API hosts for Supercode Desktop.
///
/// - **Debug** builds talk to the local CLI server by default.
/// - **Release** builds talk to production by default.
/// - Settings / sign-in can still override with any custom URL.
enum ServerConfig {
    /// Production CLI / chat API (Vercel).
    static let productionURL = "https://supercode-terminal.vercel.app"

    /// Public device-flow identifier, not the server's GitHub OAuth client ID or a secret.
    static let deviceClientID = "ai.supercode.desktop"

    static func resolvedClientID(stored: String?) -> String {
        let value = stored?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? deviceClientID : value
    }

    /// Local `apps/supercode-cli/server` (`BETTER_AUTH_URL` / typical `PORT=3004`).
    static let localURL = "http://localhost:3004"

    /// Build-appropriate default when the user has not set a custom host.
    static var defaultURL: String {
        #if DEBUG
        return localURL
        #else
        return productionURL
        #endif
    }

    /// Legacy hosts that should migrate to the current build default once.
    private static let legacyHosts: Set<String> = [
        "https://supercode-8w7e.onrender.com",
        "http://localhost:10000",
        "http://127.0.0.1:10000",
    ]

    static func normalize(_ raw: String) -> String {
        raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    }

    /// Empty / legacy → build default. Explicit Local, Production, or custom stays.
    static func resolvedURL(stored: String?) -> String {
        guard let stored, !stored.isEmpty else {
            return defaultURL
        }
        let normalized = normalize(stored)
        if normalized.isEmpty || legacyHosts.contains(normalized) {
            return defaultURL
        }
        return normalized
    }

    static var isUsingLocalDefault: Bool {
        normalize(defaultURL).contains("localhost") || normalize(defaultURL).contains("127.0.0.1")
    }

    static var buildDefaultLabel: String {
        #if DEBUG
        "Debug default: local"
        #else
        "Release default: production"
        #endif
    }

    static var buildDefaultHelp: String {
        #if DEBUG
        "Debug builds default to \(localURL). Release builds default to production."
        #else
        "Release builds default to \(productionURL)."
        #endif
    }
}
