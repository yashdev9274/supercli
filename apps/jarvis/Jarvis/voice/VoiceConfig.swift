import Foundation

enum VoiceProvider: String, CaseIterable {
    case smallestAI = "Smallest AI"
    case sarvam = "Sarvam"
}

struct VoiceConfig {
    private static let defaults = UserDefaults.standard

    // MARK: - Provider

    static var activeProvider: VoiceProvider {
        let raw = defaults.string(forKey: "active_voice_provider") ?? ""
        return VoiceProvider(rawValue: raw) ?? .sarvam
    }

    // MARK: - Smallest AI

    static var smallestAPIKey: String {
        defaults.string(forKey: "smallest_api_key") ?? ""
    }

    static var smallestVoiceID: String {
        defaults.string(forKey: "smallest_voice_id") ?? "meher"
    }

    static var smallestTTSModel: String {
        defaults.string(forKey: "smallest_tts_model") ?? "lightning_v3.1_pro"
    }

    // MARK: - Sarvam

    static var sarvamAPIKey: String {
        defaults.string(forKey: "sarvam_api_key") ?? "sk_6o5j4k3m_Skt70Sq2fUvTgrDPcu5u3uAy"
    }

    static var sarvamTTSSpeaker: String {
        defaults.string(forKey: "sarvam_tts_speaker") ?? "shubh"
    }

    static var sarvamTTSModel: String {
        defaults.string(forKey: "sarvam_tts_model") ?? "bulbul:v3"
    }

    static var sarvamLanguage: String {
        defaults.string(forKey: "sarvam_language") ?? "en-IN"
    }

    // MARK: - Common

    static var authToken: String {
        defaults.string(forKey: "auth_token") ?? ""
    }

    static var serverURL: String {
        defaults.string(forKey: "voice_server_url") ?? "http://localhost:3004"
    }

    /// Where Nova web runs. Spoken requests become threads here, so the
    /// browser does not have to be open.
    static var novaWebURL: String {
        let stored = defaults.string(forKey: "nova_web_url") ?? ""
        // Nova web listens on 3003. 3000 is the terminal client, which has no voice route.
        if stored.isEmpty || stored == "http://localhost:3000" || stored == "http://127.0.0.1:3000" {
            return "http://localhost:3003"
        }
        return stored
    }

    /// The one-time code Nova web shows for "Connect island". Empty until the
    /// user pastes it in Settings → Integrations.
    static var islandLinkCode: String {
        defaults.string(forKey: "island_link_code") ?? ""
    }

    static var screenVisionEnabled: Bool {
        defaults.object(forKey: "screen_vision_enabled") as? Bool ?? true
    }

    static func configure(
        activeProvider: VoiceProvider? = nil,
        smallestAPIKey: String? = nil,
        smallestVoiceID: String? = nil,
        smallestTTSModel: String? = nil,
        sarvamAPIKey: String? = nil,
        sarvamTTSSpeaker: String? = nil,
        sarvamTTSModel: String? = nil,
        sarvamLanguage: String? = nil,
        authToken: String? = nil,
        serverURL: String? = nil,
        novaWebURL: String? = nil,
        screenVisionEnabled: Bool? = nil,
        islandLinkCode: String? = nil
    ) {
        if let provider = activeProvider { defaults.set(provider.rawValue, forKey: "active_voice_provider") }
        if let key = smallestAPIKey { defaults.set(key, forKey: "smallest_api_key") }
        if let id = smallestVoiceID { defaults.set(id, forKey: "smallest_voice_id") }
        if let model = smallestTTSModel { defaults.set(model, forKey: "smallest_tts_model") }
        if let key = sarvamAPIKey { defaults.set(key, forKey: "sarvam_api_key") }
        if let speaker = sarvamTTSSpeaker { defaults.set(speaker, forKey: "sarvam_tts_speaker") }
        if let model = sarvamTTSModel { defaults.set(model, forKey: "sarvam_tts_model") }
        if let lang = sarvamLanguage { defaults.set(lang, forKey: "sarvam_language") }
        if let token = authToken { defaults.set(token, forKey: "auth_token") }
        if let url = serverURL { defaults.set(url, forKey: "voice_server_url") }
        if let url = novaWebURL { defaults.set(url, forKey: "nova_web_url") }
        if let enabled = screenVisionEnabled { defaults.set(enabled, forKey: "screen_vision_enabled") }
        if let code = islandLinkCode { defaults.set(code, forKey: "island_link_code") }
    }
}
