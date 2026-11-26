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

import CryptoKit
import Defaults
import Foundation

extension Notification.Name {
    static let spotifyCanvasSessionDidChange = Notification.Name("SpotifyCanvasSessionDidChange")
}

@MainActor
final class SpotifyAuthManager: ObservableObject {
    static let shared = SpotifyAuthManager()

    @Published private(set) var isAuthenticated = false
    @Published private(set) var isAuthorizing = false
    @Published private(set) var authErrorMessage: String?
    @Published private(set) var sessionStatusText = "Spotify cookie not configured."

    private let secretsURL = URL(string: "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/main/secrets/secretDict.json")!
    private let tokenURL = URL(string: "https://open.spotify.com/api/token")!
    private let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"

    private init() {
        restorePersistedState()
    }

    var configuredCookie: String {
        Self.sanitizeCookie(Defaults[.spotifySPDCCookie])
    }

    var hasConfiguredCookie: Bool {
        !configuredCookie.isEmpty
    }

    func validateSession() async {
        let sanitizedCookie = configuredCookie
        Defaults[.spotifySPDCCookie] = sanitizedCookie
        clearCachedToken()
        Defaults[.spotifyAuthLastValidatedAt] = 0
        authErrorMessage = nil
        restorePersistedState()

        guard !sanitizedCookie.isEmpty else {
            authErrorMessage = "Paste the Spotify sp_dc cookie first."
            return
        }

        isAuthorizing = true
        defer {
            isAuthorizing = false
            restorePersistedState()
        }

        guard await validAccessToken(forceRefresh: true) != nil else {
            if authErrorMessage == nil {
                authErrorMessage = "Spotify rejected the sp_dc cookie."
            }
            return
        }

        authErrorMessage = nil
        NotificationCenter.default.post(name: .spotifyCanvasSessionDidChange, object: nil)
    }

    func clearSession() {
        Defaults[.spotifySPDCCookie] = ""
        clearCachedToken()
        Defaults[.spotifyAuthLastValidatedAt] = 0
        authErrorMessage = nil
        restorePersistedState()
        NotificationCenter.default.post(name: .spotifyCanvasSessionDidChange, object: nil)
    }

    func invalidateAccessToken() {
        clearCachedToken()
        restorePersistedState()
    }

    func validAccessToken(forceRefresh: Bool = false) async -> String? {
        let sanitizedCookie = configuredCookie
        if sanitizedCookie != Defaults[.spotifySPDCCookie] {
            Defaults[.spotifySPDCCookie] = sanitizedCookie
        }

        guard !sanitizedCookie.isEmpty else {
            restorePersistedState()
            return nil
        }

        let cachedToken = Defaults[.spotifyAuthAccessToken]
        let cachedExpiration = Defaults[.spotifyAuthAccessTokenExpiration]
        if !forceRefresh, !cachedToken.isEmpty, cachedExpiration > Date().timeIntervalSince1970 + 60 {
            restorePersistedState()
            return cachedToken
        }

        do {
            let response = try await fetchWebPlayerToken(spDC: sanitizedCookie)
            Defaults[.spotifyAuthAccessToken] = response.accessToken
            Defaults[.spotifyAuthAccessTokenExpiration] = response.expirationDate.timeIntervalSince1970
            Defaults[.spotifyAuthLastValidatedAt] = Date().timeIntervalSince1970
            authErrorMessage = nil
            restorePersistedState()
            return response.accessToken
        } catch {
            clearCachedToken()
            Defaults[.spotifyAuthLastValidatedAt] = 0
            authErrorMessage = error.localizedDescription
            restorePersistedState()
            return nil
        }
    }

    private func fetchWebPlayerToken(spDC: String) async throws -> SpotifyWebPlayerTokenResponse {
        let secrets = try await fetchSecrets()
        guard let latestSecret = latestSecretEntry(from: secrets) else {
            throw SpotifyAuthError.missingSecrets
        }

        let totp = try Self.generateTOTPCode(from: latestSecret.cipher)

        var components = URLComponents(url: tokenURL, resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "reason", value: "transport"),
            URLQueryItem(name: "productType", value: "web-player"),
            URLQueryItem(name: "totp", value: totp),
            URLQueryItem(name: "totpServer", value: totp),
            URLQueryItem(name: "totpVer", value: latestSecret.version)
        ]

        guard let url = components?.url else {
            throw SpotifyAuthError.invalidRequest
        }

        var request = URLRequest(url: url)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("https://open.spotify.com/", forHTTPHeaderField: "Referer")
        request.setValue("WebPlayer", forHTTPHeaderField: "App-Platform")
        request.setValue("sp_dc=\(spDC)", forHTTPHeaderField: "Cookie")

        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.validateHTTPResponse(response, data: data)

        let tokenResponse = try JSONDecoder().decode(SpotifyWebPlayerTokenResponse.self, from: data)
        if tokenResponse.accessToken.isEmpty {
            throw SpotifyAuthError.invalidTokenResponse
        }

        return tokenResponse
    }

    private func fetchSecrets() async throws -> [String: [Int]] {
        var request = URLRequest(url: secretsURL)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.validateHTTPResponse(response, data: data)
        return try JSONDecoder().decode([String: [Int]].self, from: data)
    }

    private func latestSecretEntry(from secrets: [String: [Int]]) -> (version: String, cipher: [Int])? {
        var latestVersion: String?
        var latestCipher: [Int]?
        var highestNumericVersion = Int.min

        for (version, cipher) in secrets {
            guard let numericVersion = Int(version) else { continue }
            if numericVersion > highestNumericVersion {
                highestNumericVersion = numericVersion
                latestVersion = version
                latestCipher = cipher
            }
        }

        guard let latestVersion, let latestCipher else {
            return nil
        }

        return (latestVersion, latestCipher)
    }

    private func clearCachedToken() {
        Defaults[.spotifyAuthAccessToken] = ""
        Defaults[.spotifyAuthAccessTokenExpiration] = 0
    }

    private func restorePersistedState() {
        let cookie = configuredCookie
        let hasToken = !Defaults[.spotifyAuthAccessToken].isEmpty
            && Defaults[.spotifyAuthAccessTokenExpiration] > Date().timeIntervalSince1970 + 60
        let hasValidatedCookie = Defaults[.spotifyAuthLastValidatedAt] > 0

        isAuthenticated = !cookie.isEmpty && (hasToken || hasValidatedCookie)

        if cookie.isEmpty {
            sessionStatusText = "Spotify cookie not configured."
        } else if hasToken {
            sessionStatusText = "Spotify Canvas session ready."
        } else if hasValidatedCookie {
            sessionStatusText = "Cookie saved. The access token will refresh automatically."
        } else {
            sessionStatusText = "Cookie pasted. Validate it once to enable Canvas lookup."
        }
    }

    static func sanitizeCookie(_ rawValue: String) -> String {
        var value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)

        if let range = value.range(of: "sp_dc=") {
            value = String(value[range.upperBound...])
        }

        if let firstSemicolon = value.firstIndex(of: ";") {
            value = String(value[..<firstSemicolon])
        }

        value = value
            .replacingOccurrences(of: "\"", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return value
    }

    private static func generateTOTPCode(from cipher: [Int]) throws -> String {
        let transformed = cipher.enumerated().map { index, value in
            value ^ ((index % 33) + 9)
        }

        let secretString = transformed.map(String.init).joined()
        guard let secretData = secretString.data(using: .utf8) else {
            throw SpotifyAuthError.invalidSecretMaterial
        }

        let counter = UInt64(Date().timeIntervalSince1970 / 30)
        var counterBytes = counter.bigEndian
        let counterData = Data(bytes: &counterBytes, count: MemoryLayout<UInt64>.size)

        let mac = HMAC<Insecure.SHA1>.authenticationCode(
            for: counterData,
            using: SymmetricKey(data: secretData)
        )
        let hashData = Data(mac)
        let offset = Int(hashData.last.map { $0 & 0x0F } ?? 0)
        let truncatedRange = offset..<(offset + 4)

        guard truncatedRange.upperBound <= hashData.count else {
            throw SpotifyAuthError.invalidSecretMaterial
        }

        let truncatedBytes = Array(hashData[truncatedRange])
        let truncated =
            ((UInt32(truncatedBytes[0]) << 24)
            | (UInt32(truncatedBytes[1]) << 16)
            | (UInt32(truncatedBytes[2]) << 8)
            | UInt32(truncatedBytes[3]))
            & 0x7FFF_FFFF

        return String(format: "%06u", truncated % 1_000_000)
    }

    private static func validateHTTPResponse(_ response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw SpotifyAuthError.invalidServerResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = object["error"] as? String {
                throw SpotifyAuthError.serverError(message)
            }

            if let body = String(data: data, encoding: .utf8), !body.isEmpty {
                throw SpotifyAuthError.serverError(body)
            }

            throw SpotifyAuthError.httpFailure(httpResponse.statusCode)
        }
    }
}

private struct SpotifyWebPlayerTokenResponse: Decodable {
    let accessToken: String
    let accessTokenExpirationTimestampMs: Double?

    var expirationDate: Date {
        if let accessTokenExpirationTimestampMs {
            return Date(timeIntervalSince1970: accessTokenExpirationTimestampMs / 1000)
        }
        return Date().addingTimeInterval(3300)
    }

    private enum CodingKeys: String, CodingKey {
        case accessToken
        case accessTokenExpirationTimestampMs
    }
}

private enum SpotifyAuthError: LocalizedError {
    case invalidRequest
    case invalidServerResponse
    case invalidTokenResponse
    case invalidSecretMaterial
    case missingSecrets
    case httpFailure(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidRequest:
            return "Unable to build the Spotify token request."
        case .invalidServerResponse:
            return "Spotify returned an invalid response."
        case .invalidTokenResponse:
            return "Spotify did not return a usable access token."
        case .invalidSecretMaterial:
            return "The Spotify TOTP secret could not be decoded."
        case .missingSecrets:
            return "No valid Spotify TOTP secret was found."
        case let .httpFailure(statusCode):
            return "Spotify token request failed with HTTP \(statusCode)."
        case let .serverError(message):
            return message
        }
    }
}
