import Combine
import Foundation
import AppKit

enum VoiceAgentState: Equatable {
    case idle
    case listeningWakeWord
    case listeningCommand
    case transcribing
    case processing
    case speaking
    case micDenied

    var displayText: String {
        switch self {
        case .idle: return ""
        case .listeningWakeWord: return "Listening..."
        case .listeningCommand: return "Speak now..."
        case .transcribing: return "Transcribing..."
        case .processing: return "Thinking..."
        case .speaking: return "Speaking..."
        case .micDenied: return "Microphone blocked"
        }
    }
}

enum VoiceCommand: Equatable {
    case workspace
    case openApp(String)
    case openAppInBrowser(String, String) // app, browser
    case openYouTubeMusic
    case sendWhatsAppMessage(String, String) // contact, message
    case chat(String)
    case unknown(String)
}

@MainActor
class VoiceAgentManager: ObservableObject {
    static let shared = VoiceAgentManager()

    @Published var state: VoiceAgentState = .idle
    @Published var transcript: String = ""
    @Published var response: String = ""
    @Published var inputLevel: Float = 0
    @Published var isActive: Bool = false
    @Published var isConversationVisible: Bool = false
    @Published var lastCommand: VoiceCommand?

    /// How long the conversation UI stays visible after the agent finishes.
    private let conversationHideDelay: TimeInterval = 2.0

    private let audioCapture = AudioCaptureService()
    private var sttService: STTService
    private let ttsService = TTSService()
    private let chatService: VoiceChatService
    private let novaService = NovaVoiceService()

    /// The Nova thread this island is talking to. The first spoken request
    /// opens one; later requests continue it, so a follow-up keeps context.
    private var novaSessionId: String?

    private var ttsAPIKey: String {
        switch VoiceConfig.activeProvider {
        case .smallestAI: return VoiceConfig.smallestAPIKey
        case .sarvam: return VoiceConfig.sarvamAPIKey
        }
    }

    private var cancellables = Set<AnyCancellable>()
    private var commandBuffer: [String] = []
    private var conversationHideWorkItem: DispatchWorkItem?

    /// Rolling user/assistant turns sent with each chat request so the agent
    /// can continue multi-step tasks (ask for details, draft, confirm, send)
    /// across wake-word turns. Cleared when the user cancels the session.
    private var conversation: [[String: String]] = []
    private let conversationLimit = 20

    init() {
        let url = VoiceConfig.serverURL
        sttService = STTService(provider: VoiceConfig.activeProvider)
        chatService = VoiceChatService(serverURL: url)

        audioCapture.$inputLevel
            .receive(on: DispatchQueue.main)
            .assign(to: &$inputLevel)
    }

    /// Switches the active STT provider at runtime.
    func switchProvider(to provider: VoiceProvider) {
        UserDefaults.standard.set(provider.rawValue, forKey: "active_voice_provider")
        sttService = STTService(provider: provider)
    }

    func startWakeWordListening() {
        IslandLinkService.shared.connectIfNeeded()
        guard state == .idle else { return }
        guard !audioCapture.isMicPermissionDenied else {
            presentMicDenied()
            return
        }
        state = .listeningWakeWord
        isActive = true
        setConversationVisible(true)
        commandBuffer = []

        audioCapture.startContinuousCapture { [weak self] audioData in
            Task { @MainActor in
                self?.processWakeWordChunk(audioData)
            }
        }
    }

    func startPushToTalk() {
        IslandLinkService.shared.connectIfNeeded()
        guard state == .idle else { return }
        guard !audioCapture.isMicPermissionDenied else {
            presentMicDenied()
            return
        }
        state = .listeningCommand
        isActive = true
        setConversationVisible(true)
        transcript = ""

        audioCapture.startSingleCapture(duration: 5.0) { [weak self] audioData in
            Task { @MainActor in
                guard let data = audioData else {
                    self?.handleCaptureFailure()
                    return
                }
                self?.transcribeAndProcess(data)
            }
        }
    }

    func switchToPushToTalk() {
        guard state == .listeningWakeWord || state == .listeningCommand else { return }
        audioCapture.stopCapture()
        guard !audioCapture.isMicPermissionDenied else {
            presentMicDenied()
            return
        }
        state = .listeningCommand
        isActive = true
        setConversationVisible(true)
        transcript = ""

        audioCapture.startSingleCapture(duration: 5.0) { [weak self] audioData in
            Task { @MainActor in
                guard let data = audioData else {
                    self?.handleCaptureFailure()
                    return
                }
                self?.transcribeAndProcess(data)
            }
        }
    }

    /// Shows the "microphone blocked" state when macOS has denied mic access.
    /// Once denied, the system will not re-prompt, so the user must re-enable
    /// the mic in System Settings (the view offers a direct link).
    private func presentMicDenied() {
        audioCapture.stopCapture()
        state = .micDenied
        isActive = true
        setConversationVisible(true)
        transcript = ""
    }

    private func handleCaptureFailure() {
        if audioCapture.isMicPermissionDenied {
            presentMicDenied()
        } else {
            reset()
        }
    }

    func stopPushToTalk() {
        guard state == .listeningCommand else { return }
        audioCapture.stopCapture()
    }

    func cancel() {
        audioCapture.stopCapture()
        conversationHideWorkItem?.cancel()
        conversationHideWorkItem = nil
        isConversationVisible = false
        conversation = []
        novaSessionId = nil
        reset()
    }

    private func processWakeWordChunk(_ audioData: Data) {
        Task {
            do {
                let text = try await sttService.transcribe(audioData: audioData)
                let cleaned = sttService.sanitizeTranscription(text)

                guard !cleaned.isEmpty else { return }

                if WakeWordDetector.isJarvisWake(cleaned) {
                    audioCapture.stopCapture()
                    state = .listeningCommand
                    transcript = ""

                    audioCapture.startSingleCapture(duration: 5.0) { [weak self] commandData in
                        Task { @MainActor in
                            guard let data = commandData else {
                                self?.reset()
                                return
                            }
                            self?.transcribeAndProcess(data)
                        }
                    }

                    Task { await self.ttsService.speak("Yes?", apiKey: self.ttsAPIKey) }
                }
            } catch {
                print("[VoiceAgent] Wake word STT error: \(error)")
            }
        }
    }

    private func transcribeAndProcess(_ audioData: Data) {
        state = .transcribing

        Task {
            do {
                let text = try await sttService.transcribe(audioData: audioData)
                let cleaned = sttService.sanitizeTranscription(text)

                guard !cleaned.isEmpty, cleaned.count >= 2, cleaned.range(of: "[a-zA-Z0-9]", options: .regularExpression) != nil else {
                    reset()
                    return
                }

                transcript = cleaned
                let command = classifyCommand(cleaned)
                lastCommand = command

                switch command {
                case .workspace:
                    state = .processing
                    let result = await chatService.runWorkspaceLauncher()
                    response = result
                    state = .speaking
                    await ttsService.speak("Workspace ready", apiKey: ttsAPIKey)
                    reset()

                case .openApp(let appName):
                    state = .processing
                    let result = await chatService.openApp(appName)
                    response = result
                    state = .speaking
                    await ttsService.speak("Opening \(appName)", apiKey: ttsAPIKey)
                    reset()

                case .openAppInBrowser(let appName, let browser):
                    state = .processing
                    let result = await chatService.openAppInBrowser(appName, browser: browser)
                    response = result
                    state = .speaking
                    await ttsService.speak("Opening \(appName) in \(browser)", apiKey: ttsAPIKey)
                    reset()

                case .openYouTubeMusic:
                    state = .processing
                    let result = await chatService.openYouTubeMusic()
                    response = result
                    state = .speaking
                    await ttsService.speak("Opening YouTube Music", apiKey: ttsAPIKey)
                    reset()

                case .sendWhatsAppMessage(let contact, _):
                    state = .processing
                    let result = await chatService.sendWhatsAppMessage(to: contact)
                    response = result
                    state = .speaking
                    await ttsService.speak("Opening WhatsApp for \(contact)", apiKey: ttsAPIKey)
                    reset()

                case .chat(let message):
                    await runNovaTurn(message)

                case .unknown(let text):
                    await runNovaTurn(text)
                }
            } catch {
                print("[VoiceAgent] Processing error: \(error)")
                print("[VoiceAgent] Error type: \(type(of: error))")

                var errorMessage: String
                if let chatError = error as? ChatError {
                    switch chatError {
                    case .serverError(let code, _):
                        if code == 404 {
                            errorMessage = "Voice server not available. Please check the server is deployed."
                        } else if code == 401 {
                            errorMessage = "Authentication failed. Please log in again."
                        } else {
                            errorMessage = "Server error (\(code)). Please try again."
                        }
                    default:
                        errorMessage = "Connection error. Please check your network."
                    }
                } else {
                    errorMessage = "Error: \(error.localizedDescription)"
                }

                response = errorMessage
                Task { await self.ttsService.speak("Sorry, I couldn't process that. Please try again.", apiKey: self.ttsAPIKey) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                    self?.reset()
                }
            }
        }
    }

    /// Runs the utterance as a Nova web turn and speaks the compact summary
    /// Nova sends back. The full answer stays in the Nova thread.
    private func runNovaTurn(_ text: String) async {
        state = .processing
        transcript = text
        do {
            let turn = try await novaService.run(content: text, sessionId: novaSessionId)
            novaSessionId = turn.sessionId
            response = turn.summary
            state = .speaking
            await ttsService.speak(turn.summary, apiKey: ttsAPIKey)
            reset()
        } catch {
            print("[VoiceAgent] Nova turn failed: \(error)")
            response = (error as? LocalizedError)?.errorDescription ?? "Nova could not run that."
            await ttsService.speak("I couldn't reach Nova. Try again in a moment.", apiKey: ttsAPIKey)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in self?.reset() }
        }
    }

    private func classifyCommand(_ text: String) -> VoiceCommand {
        let lower = text.lowercased()
        let normalized = WakeWordDetector.normalize(text)
        let tokens = lower.split(separator: " ").map(String.init)

        // ── 1. Workspace triggers ──────────────────────────────────────
        let workspaceTriggers = [
            "open apps", "launch apps", "start apps", "open workspace",
            "launch workspace", "start workspace", "good morning",
            "open my apps", "launch my apps", "start my day",
            "open everything", "launch everything", "start everything"
        ]
        if workspaceTriggers.contains(where: { lower.contains($0) }) {
            return .workspace
        }
        if WakeWordDetector.isJarvisWake(normalized) {
            return .workspace
        }

        // ── 2. WhatsApp message: "send/message/whatsapp/contact/message" ─
        if let idx = tokens.firstIndex(where: { t in
            ["send", "message", "whatsapp", "text", "chat"].contains(t)
        }), idx + 2 < tokens.count {
            let after = Array(tokens[(idx + 1)...])
            if let toIdx = after.firstIndex(where: { ["to", "on", "in", "in whatsapp"].contains($0) }),
               toIdx + 1 < after.count {
                let contact = after[(toIdx + 1)...].joined(separator: " ")
                if !contact.isEmpty {
                    return .sendWhatsAppMessage(contact, text)
                }
            }
        }

        // ── 3. "open X in Y" pattern (app in specific browser) ─────────
        let openVerbs = ["open", "launch", "start", "show", "go to", "switch to"]
        for verb in openVerbs {
            if lower.hasPrefix("\(verb) ") {
                let remainder = String(lower.dropFirst(verb.count + 1))
                let remTokens = remainder.split(separator: " ").map(String.init)
                if let inIdx = remTokens.firstIndex(where: { $0 == "in" || $0 == "on" }),
                   inIdx > 0 {
                    let appPart = remTokens[..<inIdx].joined(separator: " ")
                    let browserPart = remTokens[(inIdx + 1)...].joined(separator: " ")
                    if !appPart.isEmpty && !browserPart.isEmpty {
                        return .openAppInBrowser(appPart, browserPart)
                    }
                }
            }
        }

        // ── 4. YouTube Music (before generic YouTube) ──────────────────
        let ytMusicTriggers = ["youtube music", "yt music", "ytmusic"]
        if ytMusicTriggers.contains(where: { lower.contains($0) }) {
            return .openYouTubeMusic
        }

        // ── 5. Known app triggers ──────────────────────────────────────
        let appTriggers: [(aliases: [String], appName: String)] = [
            (["whatsapp", "whats app", "what's app"], "whatsapp"),
            (["github", "git hub", "supercli", "super cli"], "github"),
            (["linear", "line ear"], "linear"),
            (["slack", "slak"], "slack"),
            (["twitter", "x dot com", "x.com", "tweet"], "twitter"),
            (["warp", "warp terminal", "terminal"], "warp"),
            (["notion"], "notion"),
            (["figma"], "figma"),
            (["discord"], "discord"),
            (["browser", "web browser", "default browser"], "browser"),
            (["chrome", "google chrome"], "chrome"),
            (["safari"], "safari"),
            (["arc"], "arc"),
            (["brave", "brave browser"], "brave"),
            (["firefox"], "firefox"),
            (["edge", "microsoft edge"], "edge"),
            (["youtube"], "youtube"),
            (["spotify"], "spotify"),
            (["music", "apple music", "itunes"], "music"),
            (["photos"], "photos"),
            (["maps", "apple maps"], "maps"),
            (["facetime"], "facetime"),
            (["notes", "apple notes"], "notes"),
            (["reminders"], "reminders"),
            (["calendar", "apple calendar"], "calendar"),
            (["finder"], "finder"),
            (["terminal"], "terminal"),
            (["system preferences", "settings"], "system preferences"),
        ]

        for verb in openVerbs {
            for (aliases, appName) in appTriggers {
                for alias in aliases {
                    if lower.contains("\(verb) \(alias)") || lower == alias {
                        return .openApp(appName)
                    }
                }
            }
        }

        // ── 6. Generic "open <single word>" fallback ───────────────────
        let stopwords: Set<String> = [
            "the", "a", "an", "my", "me", "up", "it", "that", "this", "app",
            "please", "can", "you", "would", "could", "should", "and", "for",
            "to", "now", "quickly",
        ]
        for verb in openVerbs {
            let remainder = lower
                .replacingOccurrences(of: "\(verb) ", with: "", options: [.anchored])
                .trimmingCharacters(in: .whitespaces)
            let words = remainder.split(separator: " ").map(String.init)
            if words.count == 1, !stopwords.contains(words[0]) {
                return .openApp(words[0])
            }
        }

        // ── 7. Name token extraction for chat ──────────────────────────
        let normTokens = normalized.split(separator: " ").map(String.init)
        if let nameIdx = normTokens.firstIndex(where: { WakeWordDetector.isNameToken($0) }) {
            let afterName = normTokens.dropFirst(nameIdx + 1).joined(separator: " ")
            if !afterName.isEmpty {
                return .chat(afterName)
            }
        }

        return .unknown(text)
    }

    private func localResponse(for text: String) -> String {
        let lower = text.lowercased()
        if lower.contains("hello") || lower.contains("hi") {
            return "Hey! What can I do for you?"
        }
        if lower.contains("time") {
            let formatter = DateFormatter()
            formatter.dateFormat = "h:mm a"
            return "It's \(formatter.string(from: Date()))"
        }
        if lower.contains("date") || lower.contains("day") {
            let formatter = DateFormatter()
            formatter.dateFormat = "EEEE, MMMM d"
            return "Today is \(formatter.string(from: Date()))"
        }
        if lower.contains("status") || lower.contains("how are you") {
            return "All systems operational. Ready to work."
        }
        return "Server is offline. I can still open apps, launch workspace, and run basic commands. Try saying 'open apps' or 'open WhatsApp'."
    }

    func reset() {
        audioCapture.stopCapture()
        state = .idle
        isActive = false
        setConversationVisible(false)
        inputLevel = 0
        commandBuffer = []
    }

    /// Shows the conversation UI immediately, or schedules it to hide after
    /// `conversationHideDelay` so the finished reply lingers briefly.
    private func setConversationVisible(_ visible: Bool) {
        conversationHideWorkItem?.cancel()
        conversationHideWorkItem = nil

        if visible {
            isConversationVisible = true
            return
        }

        let workItem = DispatchWorkItem { [weak self] in
            Task { @MainActor in
                self?.isConversationVisible = false
            }
        }
        conversationHideWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + conversationHideDelay, execute: workItem)
    }
}
