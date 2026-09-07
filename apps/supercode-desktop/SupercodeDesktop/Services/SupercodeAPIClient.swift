import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case server(String)
    case decoding
    case cancelled

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid server URL"
        case .unauthorized: return "Unauthorized — please sign in again"
        case .server(let message): return message
        case .decoding: return "Failed to decode server response"
        case .cancelled: return "Request cancelled"
        }
    }
}

struct DeviceCodeResponse: Decodable {
    let deviceCode: String
    let userCode: String
    let verificationUri: String
    let verificationUriComplete: String?
    let expiresIn: Int
    let interval: Int

    enum CodingKeys: String, CodingKey {
        case deviceCode = "device_code"
        case userCode = "user_code"
        case verificationUri = "verification_uri"
        case verificationUriComplete = "verification_uri_complete"
        case expiresIn = "expires_in"
        case interval
    }
}

struct TokenResponse: Decodable {
    let accessToken: String
    let refreshToken: String?
    let tokenType: String?
    let expiresIn: Int?
    let scope: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case tokenType = "token_type"
        case expiresIn = "expires_in"
        case scope
    }
}

struct ConversationDTO: Decodable {
    let id: String
    let title: String?
    let mode: String?
    let updatedAt: String?
    let createdAt: String?
}

struct MessageDTO: Decodable {
    let id: String
    let role: String
    let content: String
    let createdAt: String?
}

enum StreamEvent: Equatable {
    case text(String)
    case reasoning(String)
    case toolCall(id: String, name: String, args: [String: AnyCodable])
    case finish(reason: String?, usage: [String: AnyCodable]?)
    case error(String)
}

actor SupercodeAPIClient {
    static let shared = SupercodeAPIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let clientProductHeader = "desktop"

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 600
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
    }

    private var baseURL: URL {
        let stored = KeychainStore.get(.serverURL)
            ?? UserDefaults.standard.string(forKey: "serverURL")
        let raw = ServerConfig.resolvedURL(stored: stored)
        return URL(string: ServerConfig.normalize(raw))!
    }

    private var clientID: String {
        KeychainStore.get(.clientID)
            ?? UserDefaults.standard.string(forKey: "clientID")
            ?? ProcessInfo.processInfo.environment["GITHUB_CLIENT_ID"]
            ?? ""
    }

    private func authHeaders(includeJSON: Bool = true) -> [String: String] {
        var headers: [String: String] = [
            "X-Supercode-Client": clientProductHeader,
            "User-Agent": "Supercode Desktop",
        ]
        if includeJSON {
            headers["Content-Type"] = "application/json"
            headers["Accept"] = "application/json"
        }
        if let token = KeychainStore.get(.accessToken), !token.isEmpty {
            headers["Authorization"] = "Bearer \(token)"
        }
        return headers
    }

    private func request(
        _ method: String,
        path: String,
        body: Data? = nil,
        authorized: Bool = true
    ) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        for (key, value) in authHeaders() {
            if !authorized && key == "Authorization" { continue }
            req.setValue(value, forHTTPHeaderField: key)
        }
        req.httpBody = body
        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("Invalid response")
        }
        if http.statusCode == 401 {
            throw APIError.unauthorized
        }
        return (data, http)
    }

    // MARK: - Device auth (Better Auth)

    func requestDeviceCode() async throws -> DeviceCodeResponse {
        // better-auth device plugin endpoints under /api/auth
        let payload = try JSONSerialization.data(withJSONObject: [
            "client_id": clientID,
            "scope": "openid profile email",
        ])
        let candidates = [
            "/api/auth/device/code",
            "/api/auth/device/authorize",
        ]
        var lastError: Error = APIError.server("Device auth unavailable")
        for path in candidates {
            do {
                let (data, http) = try await request("POST", path: path, body: payload, authorized: false)
                if (200..<300).contains(http.statusCode) {
                    return try decoder.decode(DeviceCodeResponse.self, from: data)
                }
                let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
                lastError = APIError.server(message)
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    func pollDeviceToken(deviceCode: String) async throws -> TokenResponse? {
        let payload = try JSONSerialization.data(withJSONObject: [
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": deviceCode,
            "client_id": clientID,
        ])
        let (data, http) = try await request("POST", path: "/api/auth/device/token", body: payload, authorized: false)
        if http.statusCode == 400 || http.statusCode == 403 {
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let err = (obj["error"] as? String) ?? ""
                if err == "authorization_pending" || err == "slow_down" {
                    return nil
                }
                if err == "access_denied" || err == "expired_token" {
                    throw APIError.server(err)
                }
            }
            return nil
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw APIError.server(message)
        }
        return try decoder.decode(TokenResponse.self, from: data)
    }

    // MARK: - User / conversations

    func getCurrentUser() async throws -> SupercodeUser {
        let (data, http) = try await request("GET", path: "/api/user/me")
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Failed to load user")
        }
        return try decoder.decode(SupercodeUser.self, from: data)
    }

    func listConversations() async throws -> [ConversationSummary] {
        do {
            let (data, http) = try await request("GET", path: "/api/conversations")
            if (200..<300).contains(http.statusCode) {
                let rows = try decoder.decode([ConversationDTO].self, from: data)
                return rows.map { mapConversation($0) }
            }
        } catch {
            // Endpoint may not exist yet — fall through to empty/local.
        }
        return []
    }

    func createConversation(id: String? = nil, mode: String = "agent") async throws -> ConversationSummary {
        var body: [String: Any] = ["mode": mode]
        if let id { body["id"] = id }
        let payload = try JSONSerialization.data(withJSONObject: body)
        let (data, http) = try await request("POST", path: "/api/conversations", body: payload)
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Failed to create conversation")
        }
        let dto = try decoder.decode(ConversationDTO.self, from: data)
        return mapConversation(dto)
    }

    func getMessages(conversationId: String) async throws -> [ChatMessage] {
        let (data, http) = try await request("GET", path: "/api/conversations/\(conversationId)/messages")
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Failed to load messages")
        }
        let rows = try decoder.decode([MessageDTO].self, from: data)
        return rows.map { dto in
            let role = ChatMessage.Role(rawValue: dto.role) ?? .assistant
            let content = parseContentString(dto.content)
            return ChatMessage(
                id: dto.id,
                role: role,
                content: content,
                createdAt: parseDate(dto.createdAt) ?? Date(),
                parts: role == .assistant && !content.isEmpty
                    ? [.text(id: UUID().uuidString, content: content)]
                    : []
            )
        }
    }

    func addMessage(conversationId: String, role: String, content: String) async throws {
        let payload = try JSONSerialization.data(withJSONObject: [
            "role": role,
            "content": content,
        ])
        let (data, http) = try await request(
            "POST",
            path: "/api/conversations/\(conversationId)/messages",
            body: payload
        )
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.server(String(data: data, encoding: .utf8) ?? "Failed to save message")
        }
    }

    func updateMode(conversationId: String, mode: String) async throws {
        let payload = try JSONSerialization.data(withJSONObject: ["mode": mode])
        _ = try await request("PUT", path: "/api/conversations/\(conversationId)/mode", body: payload)
    }

    func updateTitle(conversationId: String, title: String) async throws {
        let payload = try JSONSerialization.data(withJSONObject: ["title": title])
        _ = try await request("PUT", path: "/api/conversations/\(conversationId)/title", body: payload)
    }

    // MARK: - NDJSON chat stream

/// Streams NDJSON chat events. `onEvent` is invoked on the cooperative task (caller should hop to MainActor if needed).
    func streamChat(
        messages: [[String: Any]],
        provider: String = "openrouter",
        model: String? = nil,
        tools: [[String: Any]]? = nil,
        onEvent: @escaping @Sendable (StreamEvent) async -> Void
    ) async throws {
        guard let url = URL(string: "/api/ai/chat", relativeTo: baseURL)?.absoluteURL else {
            throw APIError.invalidURL
        }
        var body: [String: Any] = [
            "messages": messages,
            "provider": provider,
        ]
        if let model { body["model"] = model }
        if let tools { body["tools"] = tools }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        for (key, value) in authHeaders() {
            req.setValue(value, forHTTPHeaderField: key)
        }
        req.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (bytes, response) = try await session.bytes(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("Invalid stream response")
        }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            var errorData = Data()
            for try await b in bytes { errorData.append(b) }
            let message = String(data: errorData, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw APIError.server(message)
        }

        for try await line in bytes.lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty,
                  let data = trimmed.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let type = obj["type"] as? String
            else { continue }

switch type {
            case "text":
                let content = obj["content"] as? String ?? ""
                await onEvent(.text(content))
            case "reasoning":
                let content = obj["content"] as? String ?? ""
                await onEvent(.reasoning(content))
            case "tool-call":
                let name = obj["toolName"] as? String ?? obj["name"] as? String ?? "tool"
                let id = obj["toolCallId"] as? String ?? UUID().uuidString
                var args: [String: AnyCodable] = [:]
                if let rawArgs = obj["args"] as? [String: Any] {
                    args = rawArgs.mapValues { AnyCodable($0) }
                } else if let rawArgs = obj["arguments"] as? [String: Any] {
                    args = rawArgs.mapValues { AnyCodable($0) }
                } else if let argString = obj["arguments"] as? String,
                          let data = argString.data(using: .utf8),
                          let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    args = parsed.mapValues { AnyCodable($0) }
                }
                await onEvent(.toolCall(id: id, name: name, args: args))
            case "finish":
                let reason = obj["reason"] as? String ?? obj["finishReason"] as? String
                var usage: [String: AnyCodable]?
                if let raw = obj["usage"] as? [String: Any] {
                    usage = raw.mapValues { AnyCodable($0) }
                }
                await onEvent(.finish(reason: reason, usage: usage))
            case "error":
                let message = obj["error"] as? String ?? obj["message"] as? String ?? "Stream error"
                await onEvent(.error(message))
            default:
                continue
            }
        }
    }

    // MARK: - Helpers

    private func mapConversation(_ dto: ConversationDTO) -> ConversationSummary {
        ConversationSummary(
            id: dto.id,
            title: dto.title ?? "New conversation",
            mode: dto.mode ?? "agent",
            updatedAt: parseDate(dto.updatedAt) ?? parseDate(dto.createdAt),
            folder: nil
        )
    }

    private func parseContentString(_ raw: String) -> String {
        if let data = raw.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) {
            if let str = obj as? String { return str }
            if let dict = obj as? [String: Any], let text = dict["text"] as? String { return text }
            if let arr = obj as? [[String: Any]] {
                return arr.compactMap { $0["text"] as? String }.joined(separator: "\n")
            }
        }
        return raw
    }

    private func parseDate(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: raw)
    }
}
