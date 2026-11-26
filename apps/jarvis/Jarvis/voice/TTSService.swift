import AVFoundation
import Foundation

class TTSService {
    private let smallestURL = "https://api.smallest.ai/waves/v1/tts"
    private let sarvamURL = "https://api.sarvam.ai/text-to-speech"
    private let session = URLSession.shared
    private let maxChars = 1500

    func speak(_ text: String, apiKey: String? = nil) async {
        let cleaned = stripForSpeech(text)
        guard !cleaned.isEmpty else { return }

        let provider = VoiceConfig.activeProvider

        // if provider == .smallestAI, let key = apiKey, !key.isEmpty {
        //     do {
        //         let audioData = try await fetchSmallestTTS(text: cleaned, apiKey: key)
        //         await playAudioData(audioData)
        //         return
        //     } catch {
        //         print("[TTSService] Smallest AI TTS failed, falling back to say: \(error)")
        //     }
        // }

        if provider == .smallestAI || provider == .sarvam {
            let sarvamKey = VoiceConfig.sarvamAPIKey
            if !sarvamKey.isEmpty {
                do {
                    let audioData = try await fetchSarvamTTS(text: cleaned, apiKey: sarvamKey)
                    await playAudioData(audioData)
                    return
                } catch {
                    print("[TTSService] Sarvam TTS failed, falling back to say: \(error)")
                }
            }
        }

        await speakWithSay(cleaned)
    }

    // MARK: - Smallest AI

    private func fetchSmallestTTS(text: String, apiKey: String) async throws -> Data {
        guard let url = URL(string: smallestURL) else {
            throw TTSError.invalidURL
        }

        let voiceID = UserDefaults.standard.string(forKey: "smallest_voice_id") ?? "meher"
        let modelID = UserDefaults.standard.string(forKey: "smallest_tts_model") ?? "lightning_v3.1_pro"

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "text": text,
            "voice_id": voiceID,
            "model": modelID,
            "sample_rate": 24000,
            "speed": 1.0,
            "language": "en",
            "output_format": "wav"
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw TTSError.apiError(statusCode: code)
        }

        return data
    }

    // MARK: - Sarvam

    private func fetchSarvamTTS(text: String, apiKey: String) async throws -> Data {
        guard let url = URL(string: sarvamURL) else {
            throw TTSError.invalidURL
        }

        let speaker = "shubh"
        let model = "bulbul:v3"
        let langCode = mapLanguageCode(VoiceConfig.sarvamLanguage)

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue(apiKey, forHTTPHeaderField: "api-subscription-key")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "text": text,
            "target_language_code": langCode,
            "speaker": speaker,
            "model": model,
            "speech_sample_rate": 24000,
            "pace": 1.0,
            "preprocessing": true
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        print("[TTSService] Calling Sarvam TTS (speaker: \(speaker), model: \(model))")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let bodyString = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            print("[TTSService] Sarvam TTS error \(code): \(bodyString.prefix(300))")
            throw TTSError.apiError(statusCode: code)
        }

        // Sarvam TTS response: {"audios": ["base64-encoded-audio"]}
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let audios = json["audios"] as? [String],
              let firstAudio = audios.first,
              let audioDecoded = Data(base64Encoded: firstAudio) else {
            print("[TTSService] Sarvam TTS response missing audios: \(String(data: data, encoding: .utf8)?.prefix(300) ?? "<non-utf8>")")
            throw TTSError.invalidResponse
        }

        print("[TTSService] Sarvam TTS returned \(audioDecoded.count) bytes")
        return audioDecoded
    }

    private func mapLanguageCode(_ lang: String) -> String {
        switch lang {
        case "hi", "hi-IN": return "hi-IN"
        case "bn", "bn-IN": return "bn-IN"
        case "ta", "ta-IN": return "ta-IN"
        case "te", "te-IN": return "te-IN"
        case "mr", "mr-IN": return "mr-IN"
        case "gu", "gu-IN": return "gu-IN"
        case "kn", "kn-IN": return "kn-IN"
        case "ml", "ml-IN": return "ml-IN"
        case "pa", "pa-IN": return "pa-IN"
        case "ur", "ur-IN": return "ur-IN"
        default: return "en-IN"
        }
    }

    // MARK: - Playback

    private func playAudioData(_ data: Data) async {
        do {
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("jarvis-tts-\(UUID().uuidString).wav")
            try data.write(to: tempURL)

            let player = try AVAudioPlayer(contentsOf: tempURL)
            player.play()

            while player.isPlaying {
                try? await Task.sleep(nanoseconds: 100_000_000)
            }

            try? FileManager.default.removeItem(at: tempURL)
        } catch {
            print("[TTSService] Failed to play audio: \(error)")
        }
    }

    private func speakWithSay(_ text: String) async {
        await withCheckedContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
            process.terminationHandler = { _ in continuation.resume() }

            let pipe = Pipe()
            process.standardInput = pipe

            do {
                try process.run()
                if let data = text.data(using: .utf8) {
                    pipe.fileHandleForWriting.write(data)
                }
                pipe.fileHandleForWriting.closeFile()
            } catch {
                print("[TTSService] say failed: \(error)")
                continuation.resume()
            }
        }
    }

    func stripForSpeech(_ text: String) -> String {
        var result = text
        result = result.replacingOccurrences(of: "```[\\s\\S]*?```", with: " ", options: .regularExpression)
        result = result.replacingOccurrences(of: "`([^`]*)`", with: "$1", options: .regularExpression)
        result = result.replacingOccurrences(of: "\\[([^\\]]*)\\]\\([^)]*\\)", with: "$1", options: .regularExpression)
        result = result.replacingOccurrences(of: "^#{1,6}\\s+", with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: "^\\s*[-*+]\\s+", with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: "[#*_~>|]", with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: "^\\s{2,}", with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: "\\n{3,}", with: "\n\n", options: .regularExpression)
        result = result.trimmingCharacters(in: .whitespacesAndNewlines)
        if result.count > maxChars {
            result = String(result.prefix(maxChars))
        }
        return result
    }
}

enum TTSError: LocalizedError {
    case invalidURL
    case invalidResponse
    case apiError(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid TTS URL"
        case .invalidResponse: return "Invalid TTS response"
        case .apiError(let code): return "TTS error: \(code)"
        }
    }
}
