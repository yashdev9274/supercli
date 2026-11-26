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
import MusicKit

actor AnimatedArtworkManager {
    static let shared = AnimatedArtworkManager()

    private var cachedSongID: String?
    private var cachedVideoURL: URL?
    private var cachedKey: String?

    // MARK: - Token failure backoff
    //
    // When MusicKit returns a developer-token error (e.g. 404 "Client not found"),
    // there is no point hammering the Apple token service on every track change.
    // We track consecutive failures and back off exponentially so that a
    // persistent MusicKit misconfiguration (wrong bundle ID, revoked token, etc.)
    // doesn't generate hundreds of network round-trips overnight.
    //
    // Back-off schedule: 30s → 60s → 120s → 240s → 300s (capped)
    // The counter is reset whenever a song changes (new key) or on success.
    private var tokenFailureCount: Int = 0
    private var tokenFailureLastAttempt: Date? = nil
    private static let maxBackoffSeconds: TimeInterval = 300 // 5 minutes cap

    private func tokenBackoffInterval() -> TimeInterval {
        guard tokenFailureCount > 0 else { return 0 }
        let base: TimeInterval = 30
        let exponential = base * pow(2.0, Double(tokenFailureCount - 1))
        return min(exponential, Self.maxBackoffSeconds)
    }

    private func isWithinTokenBackoff() -> Bool {
        guard tokenFailureCount > 0, let last = tokenFailureLastAttempt else { return false }
        return Date().timeIntervalSince(last) < tokenBackoffInterval()
    }

    func fetchAnimatedArtworkURL(title: String, artist: String) async -> URL? {
        let key = "\(title)|\(artist)"

        // Return the cached result for the same song immediately.
        if key == cachedKey {
            return cachedVideoURL
        }

        // If MusicKit token has been consistently failing, honour the back-off
        // window before making another network request.
        // We do NOT cache this failure, allowing a retry on the same song once backoff expires.
        if isWithinTokenBackoff() {
            return nil
        }

        guard await requestMusicAuthorization() else {
            return nil
        }

        // Auth and backoff checks passed. Cache the key and clear old video URL.
        cachedKey = key
        cachedVideoURL = nil

        guard let songID = await searchSongID(title: title, artist: artist) else {
            return nil
        }

        guard let videoURL = await fetchEditorialVideoURL(songID: songID) else {
            return nil
        }

        cachedSongID = songID
        cachedVideoURL = videoURL
        return videoURL
    }

    func clearCache() {
        cachedKey = nil
        cachedSongID = nil
        cachedVideoURL = nil
        resetTokenFailureState()
    }

    private func resetTokenFailureState() {
        tokenFailureCount = 0
        tokenFailureLastAttempt = nil
    }

    // MARK: - MusicKit Authorization

    private func requestMusicAuthorization() async -> Bool {
        let status = MusicAuthorization.currentStatus
        if status == .authorized { return true }

        let newStatus = await MusicAuthorization.request()
        return newStatus == .authorized
    }

    // MARK: - Song Search

    private func searchSongID(title: String, artist: String) async -> String? {
        let term = "\(title) \(artist)"
        var request = MusicCatalogSearchRequest(term: term, types: [Song.self])
        request.limit = 5

        do {
            let response = try await request.response()
            resetTokenFailureState()
            
            let normalizedTitle = title.lowercased()
            let normalizedArtist = artist.lowercased()

            let match = response.songs.first(where: {
                $0.title.lowercased() == normalizedTitle &&
                $0.artistName.lowercased() == normalizedArtist
            }) ?? response.songs.first(where: {
                $0.title.lowercased() == normalizedTitle
            }) ?? response.songs.first

            guard let song = match else { return nil }
            return song.id.rawValue
        } catch {
            print("[AnimatedArtworkManager] Search failed: \(error)")
            // Record a token failure if this is a developer token / auth error so
            // subsequent calls back off instead of immediately re-hitting the network.
            recordTokenFailureIfNeeded(for: error)
            return nil
        }
    }

    // MARK: - Editorial Video Fetch

    private func fetchEditorialVideoURL(songID: String) async -> URL? {
        let storefront: String
        if let code = try? await MusicDataRequest.currentCountryCode {
            storefront = code
        } else {
            storefront = "us"
        }

        return await fetchEditorialVideoURLFallback(songID: songID, storefront: storefront)
    }

    private func fetchEditorialVideoURLFallback(songID: String, storefront: String) async -> URL? {
        guard let url = URL(string: "https://api.music.apple.com/v1/catalog/\(storefront)/songs/\(songID)?extend=editorialVideo") else {
            return nil
        }

        do {
            let request = MusicDataRequest(urlRequest: URLRequest(url: url))
            let response = try await request.response()
            resetTokenFailureState()

            guard let json = try JSONSerialization.jsonObject(with: response.data) as? [String: Any],
                  let data = json["data"] as? [[String: Any]],
                  let first = data.first,
                  let attributes = first["attributes"] as? [String: Any],
                  let editorialVideo = attributes["editorialVideo"] as? [String: Any]
            else { return nil }

            if let motionTall = editorialVideo["motionTallVideo3x4"] as? [String: Any],
               let videoURLString = motionTall["video"] as? String,
               let videoURL = URL(string: videoURLString) {
                return videoURL
            }

            if let motionSquare = editorialVideo["motionSquareVideo1x1"] as? [String: Any],
               let videoURLString = motionSquare["video"] as? String,
               let videoURL = URL(string: videoURLString) {
                return videoURL
            }

            let hlsPattern = try? NSRegularExpression(pattern: "https://mvod\\.itunes\\.apple\\.com[^\"]+\\.m3u8")
            let jsonString = String(data: response.data, encoding: .utf8) ?? ""
            let range = NSRange(jsonString.startIndex..., in: jsonString)
            if let match = hlsPattern?.firstMatch(in: jsonString, range: range),
               let matchRange = Range(match.range, in: jsonString) {
                return URL(string: String(jsonString[matchRange]))
            }

            return nil
        } catch {
            print("[AnimatedArtworkManager] Editorial video fetch failed: \(error)")
            recordTokenFailureIfNeeded(for: error)
            return nil
        }
    }

    // MARK: - Token Backoff Helpers

    /// Increments the failure counter when the error looks like a persistent
    /// MusicKit token/auth failure (HTTP 401, 403, 404 from the token service).
    /// Transient network errors (timeout, no connection) are NOT counted so that
    /// a brief offline period doesn't trigger the long back-off.
    private func recordTokenFailureIfNeeded(for error: Error) {
        let description = String(describing: error).lowercased()
        // Match developer-token errors (ICError -8200), auth failures, or HTTP 4xx
        // from the Apple Music API token service.
        let looksLikeTokenError =
            description.contains("developertokenrequestfailed") ||
            description.contains("developertoken") ||
            description.contains("-8200") ||
            description.contains("401") ||
            description.contains("403") ||
            (description.contains("404") && description.contains("token"))

        guard looksLikeTokenError else { return }

        tokenFailureCount += 1
        tokenFailureLastAttempt = Date()
        let backoff = tokenBackoffInterval()
        print("[AnimatedArtworkManager] Token failure #\(tokenFailureCount); backing off for \(Int(backoff))s")
    }
}
