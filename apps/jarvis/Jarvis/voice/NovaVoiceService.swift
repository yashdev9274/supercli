import Foundation

/// Sends a spoken request to Nova web and returns the short summary Nova wants
/// spoken back. Nova runs the full turn in its own thread; the browser does
/// not need to be open.
struct NovaVoiceService {
    private let session = URLSession.shared

    struct TurnResult {
        let sessionId: String
        let summary: String
    }

    enum NovaError: LocalizedError {
        case notSignedIn
        case unavailable(String)
        case turnFailed(String, String?)

        var errorDescription: String? {
            switch self {
            case .notSignedIn: return "Sign in to Nova from Settings first."
            case .unavailable(let message): return message
            case .turnFailed(let message, _): return message
            }
        }
    }

    func run(content: String, sessionId: String?) async throws -> TurnResult {
        let token = VoiceConfig.authToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else { throw NovaError.notSignedIn }

        let base = VoiceConfig.novaWebURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(base)/api/nova/voice/turn") else { throw NovaError.unavailable("Nova address is not set.") }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 600
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        var body: [String: String] = ["content": content]
        if let sessionId, !sessionId.isEmpty { body["sessionId"] = sessionId }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let message = json?["error"] as? String ?? "Nova could not run that."
            throw NovaError.turnFailed(message, json?["sessionId"] as? String)
        }
        guard let summary = json?["summary"] as? String, let id = json?["sessionId"] as? String else {
            throw NovaError.unavailable("Nova sent back an empty answer.")
        }
        return TurnResult(sessionId: id, summary: summary)
    }
}
