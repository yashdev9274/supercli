import Foundation

class STTService {
    private let session = URLSession.shared
    private let language: String
    private let provider: VoiceProvider

    init(provider: VoiceProvider = VoiceConfig.activeProvider, language: String = "en") {
        self.provider = provider
        self.language = language
    }

    func transcribe(audioData: Data) async throws -> String {
        switch provider {
        // case .smallestAI:
        //     return try await transcribeSmallest(audioData: audioData)
        case .smallestAI, .sarvam:
            return try await transcribeSarvam(audioData: audioData)
        }
    }

    // MARK: - Smallest AI

    private func transcribeSmallest(audioData: Data) async throws -> String {
        let apiKey = VoiceConfig.smallestAPIKey
        guard !apiKey.isEmpty else {
            print("[STTService] No Smallest AI API key configured")
            throw STTError.apiError(statusCode: 0, message: "No Smallest AI API key configured")
        }

        guard let url = URL(string: "https://api.smallest.ai/waves/v1/pulse/get_text?language=\(language)") else {
            throw STTError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.addValue("audio/wav", forHTTPHeaderField: "Content-Type")
        request.httpBody = audioData
        request.timeoutInterval = 15

        print("[STTService] Sending \(audioData.count) bytes to Smallest AI Pulse")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw STTError.apiError(statusCode: 0, message: "No HTTP response")
        }

        let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"
        print("[STTService] Response \(httpResponse.statusCode): \(bodyString.prefix(500))")

        guard httpResponse.statusCode == 200 else {
            throw STTError.apiError(statusCode: httpResponse.statusCode, message: bodyString)
        }

        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let text = json["transcription"] as? String, !text.isEmpty { return text }
            if let text = json["text"] as? String, !text.isEmpty { return text }
            if let text = json["transcript"] as? String, !text.isEmpty { return text }
            if let result = json["result"] as? [String: Any], let text = result["text"] as? String, !text.isEmpty {
                return text
            }
            print("[STTService] JSON response missing 'text' field: \(json.keys.joined(separator: ", "))")
            throw STTError.invalidResponse
        }

        if let text = String(data: data, encoding: .utf8), !text.isEmpty {
            print("[STTService] Got plain text response: \(text.prefix(200))")
            return text
        }

        throw STTError.invalidResponse
    }

    // MARK: - Sarvam

    private func transcribeSarvam(audioData: Data) async throws -> String {
        let apiKey = VoiceConfig.sarvamAPIKey
        guard !apiKey.isEmpty else {
            print("[STTService] No Sarvam API key configured")
            throw STTError.apiError(statusCode: 0, message: "No Sarvam API key configured")
        }

        guard let url = URL(string: "https://api.sarvam.ai/speech-to-text") else {
            throw STTError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue(apiKey, forHTTPHeaderField: "api-subscription-key")
        request.timeoutInterval = 15

        // Multipart form-data
        let boundary = "Boundary-\(UUID().uuidString)"
        request.addValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        let lineBreak = "\r\n"

        // audio file
        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\(lineBreak)".data(using: .utf8)!)
        body.append(lineBreak.data(using: .utf8)!)
        body.append(audioData)
        body.append(lineBreak.data(using: .utf8)!)

        // model
        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"model\"\(lineBreak)\(lineBreak)".data(using: .utf8)!)
        body.append("saaras:v3\(lineBreak)".data(using: .utf8)!)

        // language_code
        let sarvamLang = mapLanguageCode(language)
        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"language_code\"\(lineBreak)\(lineBreak)".data(using: .utf8)!)
        body.append("\(sarvamLang)\(lineBreak)".data(using: .utf8)!)

        // with_timestamps
        body.append("--\(boundary)\(lineBreak)".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"with_timestamps\"\(lineBreak)\(lineBreak)".data(using: .utf8)!)
        body.append("false\(lineBreak)".data(using: .utf8)!)

        body.append("--\(boundary)--\(lineBreak)".data(using: .utf8)!)

        request.httpBody = body

        print("[STTService] Sending \(audioData.count) bytes to Sarvam STT (saaras:v3)")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw STTError.apiError(statusCode: 0, message: "No HTTP response")
        }

        let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"
        print("[STTService] Sarvam response \(httpResponse.statusCode): \(bodyString.prefix(500))")

        guard httpResponse.statusCode == 200 else {
            throw STTError.apiError(statusCode: httpResponse.statusCode, message: bodyString)
        }

        // Sarvam response: {"transcript": "...", "timestamps": [...]}
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let text = json["transcript"] as? String, !text.isEmpty { return text }
            if let text = json["text"] as? String, !text.isEmpty { return text }
            if let text = json["result"] as? String, !text.isEmpty { return text }
            print("[STTService] Sarvam JSON missing 'transcript': \(json.keys.joined(separator: ", "))")
            throw STTError.invalidResponse
        }

        if let text = String(data: data, encoding: .utf8), !text.isEmpty {
            return text
        }

        throw STTError.invalidResponse
    }

    private func mapLanguageCode(_ lang: String) -> String {
        switch lang {
        case "hi": return "hi-IN"
        case "bn": return "bn-IN"
        case "ta": return "ta-IN"
        case "te": return "te-IN"
        case "mr": return "mr-IN"
        case "gu": return "gu-IN"
        case "kn": return "kn-IN"
        case "ml": return "ml-IN"
        case "pa": return "pa-IN"
        case "ur": return "ur-IN"
        default: return "en-IN"
        }
    }

    func sanitizeTranscription(_ text: String) -> String {
        let pattern = "\\([^)]*(?:noise|clicking|static|background|sound|audio|speaking|unintelligible|laughs?|coughs?|clears?\\s+(?:throat|voice)|pause|music|beep|tone|silence|indistinct|foreign|applause|sniffling|sighs?|breathing|rustling|mumbling|chatter|echo)[^)]*\\)"
        let cleaned = text.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        return cleaned.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum STTError: LocalizedError {
    case invalidURL
    case apiError(statusCode: Int, message: String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid STT URL"
        case .apiError(let code, let msg): return "STT error (\(code)): \(msg)"
        case .invalidResponse: return "Invalid response from STT service"
        }
    }
}
