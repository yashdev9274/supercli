import Foundation

/// Joins the voice link Nova web opens on the CLI server, and mirrors spoken
/// turns into it so the Nova tab shows what the island heard and said.
///
/// Speech stays local (Sarvam). This only moves text, and only while a code
/// from Nova's "Connect island" button is set in Settings.
@MainActor
final class IslandLinkService {
    static let shared = IslandLinkService()

    private let session = URLSession.shared
    private var linkId: String?
    private var cursor = 0
    private var pollTask: Task<Void, Never>?

    private init() {}

    /// Join the link for the code currently in settings. Safe to call often:
    /// a live link is left alone, and a missing code does nothing.
    func connectIfNeeded() {
        guard linkId == nil, !VoiceConfig.authToken.isEmpty else { return }
        let code = VoiceConfig.islandLinkCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard code.count >= 4 else { return }
        Task { await join(code: code) }
    }

    func post(role: String, content: String) {
        guard let linkId else { return }
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        Task {
            var request = request(path: "/api/voice/link/\(linkId)/turn", method: "POST")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["role": role, "content": text])
            _ = try? await session.data(for: request)
        }
    }

    private func join(code: String) async {
        var request = request(path: "/api/voice/link/join", method: "POST")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code])
        guard
            let (data, response) = try? await session.data(for: request),
            (response as? HTTPURLResponse)?.statusCode == 200,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let id = json["linkId"] as? String
        else { return }
        linkId = id
        cursor = (json["turns"] as? [Any])?.count ?? 0
        startPolling()
    }

    private func startPolling() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await self?.poll()
            }
        }
    }

    private func poll() async {
        guard let linkId else { return }
        let request = request(path: "/api/voice/link/\(linkId)/island?since=\(cursor)", method: "GET")
        guard
            let (data, response) = try? await session.data(for: request),
            let http = response as? HTTPURLResponse
        else { return }
        if http.statusCode == 404 {
            self.linkId = nil
            pollTask?.cancel()
            return
        }
        guard
            http.statusCode == 200,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        cursor = json["cursor"] as? Int ?? cursor
    }

    private func request(path: String, method: String) -> URLRequest {
        let request = URLRequest(url: URL(string: "\(VoiceConfig.serverURL)\(path)")!)
        var copy = request
        copy.httpMethod = method
        copy.addValue("application/json", forHTTPHeaderField: "Content-Type")
        copy.addValue("Bearer \(VoiceConfig.authToken)", forHTTPHeaderField: "Authorization")
        copy.timeoutInterval = 10
        return copy
    }
}
