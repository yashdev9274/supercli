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

/// Thin protocol abstraction over the Composio REST API so the client can be
/// swapped for a stub in tests (same pattern as SpotifyHTTPClient).
protocol ComposioAPIClienting: Sendable {
    func fetchToolkits() async throws -> [ComposioToolkit]
    func fetchAuthConfigs(toolkitSlug: String) async throws -> [ComposioAuthConfig]
    func createLinkSession(authConfigID: String, userID: String, alias: String?, callbackURL: String) async throws -> ComposioLinkSession
    func fetchConnectedAccounts(userID: String) async throws -> [ComposioConnectedAccount]
    func disconnectAccount(id: String) async throws
    func fetchToolkitActions(toolkitSlug: String) async throws -> [ComposioToolAction]
    func executeAction(slug: String, userID: String, connectedAccountID: String?, arguments: [String: ComposioJSONValue]) async throws -> ComposioToolExecutionResponse
}

struct ComposioAPIClient: ComposioAPIClienting {
    static let baseURL = URL(string: "https://backend.composio.dev/api/v3.1")!

    private struct ComposioExecuteBody: Encodable {
        let userID: String
        let connectedAccountID: String?
        let arguments: [String: ComposioJSONValue]

        enum CodingKeys: String, CodingKey {
            case userID = "user_id"
            case connectedAccountID = "connected_account_id"
            case arguments
        }
    }

    private let apiKey: String
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(apiKey: String, session: URLSession = .shared) {
        self.apiKey = apiKey
        self.session = session
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .useDefaultKeys
        self.decoder = decoder
        self.encoder = JSONEncoder()
    }

    // MARK: Toolkits

    func fetchToolkits() async throws -> [ComposioToolkit] {
        let url = Self.baseURL.appending(path: "toolkits")
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "limit", value: "100"),
            URLQueryItem(name: "sort_by", value: "usage")
        ]
        let envelope: ComposioListEnvelope<ComposioToolkit> = try await get(
            path: "toolkits",
            query: components.queryItems
        )
        return envelope.items
    }

    // MARK: Auth configs

    func fetchAuthConfigs(toolkitSlug: String) async throws -> [ComposioAuthConfig] {
        let envelope: ComposioListEnvelope<ComposioAuthConfig> = try await get(
            path: "auth_configs",
            query: [
                URLQueryItem(name: "toolkit_slug", value: toolkitSlug),
                URLQueryItem(name: "is_composio_managed", value: "true")
            ]
        )
        return envelope.items
    }

    // MARK: Link session

    func createLinkSession(authConfigID: String, userID: String, alias: String?, callbackURL: String) async throws -> ComposioLinkSession {
        var body: [String: String] = [
            "auth_config_id": authConfigID,
            "user_id": userID,
            "callback_url": callbackURL
        ]
        if let alias {
            body["alias"] = alias
        }
        return try await post(path: "connected_accounts/link", body: body)
    }

    // MARK: Connected accounts

    func fetchConnectedAccounts(userID: String) async throws -> [ComposioConnectedAccount] {
        let envelope: ComposioListEnvelope<ComposioConnectedAccount> = try await get(
            path: "connected_accounts",
            query: [
                URLQueryItem(name: "user_ids", value: userID),
                URLQueryItem(name: "limit", value: "100")
            ]
        )
        return envelope.items
    }

    func disconnectAccount(id: String) async throws {
        try await request(method: "DELETE", path: "connected_accounts/\(id)", body: nil as String?)
    }

    // MARK: Tool actions

    func fetchToolkitActions(toolkitSlug: String) async throws -> [ComposioToolAction] {
        let envelope: ComposioListEnvelope<ComposioToolAction> = try await get(
            path: "tools",
            query: [
                URLQueryItem(name: "toolkits", value: toolkitSlug),
                URLQueryItem(name: "limit", value: "100")
            ]
        )
        return envelope.items
    }

    func executeAction(slug: String, userID: String, connectedAccountID: String?, arguments: [String: ComposioJSONValue]) async throws -> ComposioToolExecutionResponse {
        let body = ComposioExecuteBody(
            userID: userID,
            connectedAccountID: connectedAccountID,
            arguments: arguments
        )
        return try await post(path: "tools/execute/\(slug)", body: body)
    }

    // MARK: Transport

    private func get<T: Decodable>(path: String, query: [URLQueryItem]?) async throws -> T {
        var components = URLComponents(url: Self.baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        components.queryItems = query
        guard let url = components.url else { throw ComposioAPIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        return try await perform(request)
    }

    private func post<T: Decodable, B: Encodable>(path: String, body: B) async throws -> T {
        var request = URLRequest(url: Self.baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        return try await perform(request)
    }

    private func request<B: Encodable>(method: String, path: String, body: B?) async throws {
        var request = URLRequest(url: Self.baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw ComposioAPIError.decoding(String(describing: error))
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw ComposioAPIError.httpStatus(http.statusCode, body.isEmpty ? nil : body)
        }
    }
}
