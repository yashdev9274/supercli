import AppKit
import AVFoundation
import Combine

@MainActor
final class VoiceCallStore: NSObject, ObservableObject {
    static let shared = VoiceCallStore()

    enum State: Equatable {
        case idle
        case requestingPermission
        case listening
        case transcribing
        case thinking
        case speaking
        case muted
        case failed(String)

        var label: String {
            switch self {
            case .idle: return "Voice call ended"
            case .requestingPermission: return "Requesting microphone access"
            case .listening: return "Listening"
            case .transcribing: return "Understanding you"
            case .thinking: return "Supercode is working"
            case .speaking: return "Supercode is speaking"
            case .muted: return "Microphone muted"
            case .failed: return "Voice call paused"
            }
        }
    }

    @Published private(set) var isActive = false
    @Published private(set) var state: State = .idle
    @Published private(set) var inputLevel: Float = 0
    @Published private(set) var transcript = ""
    @Published private(set) var errorMessage: String?

    private let capture = DesktopVoiceCapture()
    private var audioPlayer: AVAudioPlayer?
    private var systemSpeechProcess: Process?
    private var requestTask: Task<Void, Never>?
    private var partialTranscriptionTask: Task<Void, Never>?
    private var activeTurnID: UUID?
    private var cancellables: Set<AnyCancellable> = []
    private var sessionID = UUID()

    private override init() {
        super.init()
        AgentRunStore.shared.$lastTurnResult
            .compactMap { $0 }
            .receive(on: RunLoop.main)
            .sink { [weak self] result in
                self?.handleTurnResult(result)
            }
            .store(in: &cancellables)
    }

    func toggleCall() {
        isActive ? endCall() : startCall()
    }

    func startCall() {
        guard !isActive else { return }
        isActive = true
        sessionID = UUID()
        transcript = ""
        errorMessage = nil
        beginListening()
    }

    func endCall() {
        isActive = false
        sessionID = UUID()
        requestTask?.cancel()
        requestTask = nil
        partialTranscriptionTask?.cancel()
        partialTranscriptionTask = nil
        activeTurnID = nil
        capture.stop()
        audioPlayer?.stop()
        audioPlayer = nil
        systemSpeechProcess?.terminate()
        systemSpeechProcess = nil
        inputLevel = 0
        state = .idle
    }

    func toggleMute() {
        guard isActive else { return }
        if state == .muted {
            beginListening()
        } else {
            capture.stop()
            partialTranscriptionTask?.cancel()
            partialTranscriptionTask = nil
            inputLevel = 0
            state = .muted
        }
    }

    func interruptAndListen() {
        guard isActive else { return }
        audioPlayer?.stop()
        audioPlayer = nil
        systemSpeechProcess?.terminate()
        systemSpeechProcess = nil
        if activeTurnID != nil {
            AgentRunStore.shared.stop()
            activeTurnID = nil
        }
        beginListening()
    }

    func openMicrophoneSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") else { return }
        NSWorkspace.shared.open(url)
    }

    private func beginListening() {
        guard isActive else { return }
        requestTask?.cancel()
        requestTask = nil
        let expectedSession = sessionID
        state = .requestingPermission
        Task {
            let granted = await capture.requestPermission()
            guard isActive, sessionID == expectedSession else { return }
            guard granted else {
                state = .failed("Microphone access is disabled")
                errorMessage = "Enable microphone access in System Settings to use voice calls."
                return
            }
            listen(expectedSession: expectedSession)
        }
    }

    private func listen(expectedSession: UUID) {
        guard isActive, sessionID == expectedSession else { return }
        state = .listening
        errorMessage = nil
        inputLevel = 0
        transcript = ""
        do {
            try capture.start(
                silenceDuration: 2,
                onLevel: { [weak self] level in
                    guard let self, self.state == .listening else { return }
                    self.inputLevel = min(level * 18, 1)
                },
                onPartialAudio: { [weak self] data in
                    self?.transcribePartial(data, expectedSession: expectedSession)
                },
                completion: { [weak self] data in
                    guard let self, self.isActive, self.sessionID == expectedSession else { return }
                    self.inputLevel = 0
                    self.partialTranscriptionTask?.cancel()
                    self.partialTranscriptionTask = nil
                    guard let data else {
                        self.scheduleListenAgain(expectedSession: expectedSession)
                        return
                    }
                    self.transcribe(data, expectedSession: expectedSession)
                }
            )
        } catch {
            fail(error.localizedDescription)
        }
    }

    private func transcribePartial(_ audio: Data, expectedSession: UUID) {
        guard isActive,
              sessionID == expectedSession,
              state == .listening,
              partialTranscriptionTask == nil else { return }
        partialTranscriptionTask = Task {
            defer { partialTranscriptionTask = nil }
            do {
                let text = try await SupercodeAPIClient.shared.transcribeVoice(audio)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !Task.isCancelled,
                      isActive,
                      sessionID == expectedSession,
                      state == .listening,
                      text.contains(where: { $0.isLetter || $0.isNumber }) else { return }
                transcript = text
            } catch is CancellationError {
                return
            } catch {
                // Partial transcription is best-effort; final transcription still owns submission.
            }
        }
    }

    private func transcribe(_ audio: Data, expectedSession: UUID) {
        state = .transcribing
        requestTask = Task {
            do {
                let text = try await SupercodeAPIClient.shared.transcribeVoice(audio)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                guard !Task.isCancelled, isActive, sessionID == expectedSession else { return }
                guard text.count >= 2, text.contains(where: { $0.isLetter || $0.isNumber }) else {
                    scheduleListenAgain(expectedSession: expectedSession)
                    return
                }
                transcript = text
                state = .thinking
                guard let turnID = AgentRunStore.shared.send(prompt: text) else {
                    fail("The agent is not ready for another turn.")
                    return
                }
                activeTurnID = turnID
            } catch is CancellationError {
                return
            } catch {
                fail(error.localizedDescription)
            }
        }
    }

    private func handleTurnResult(_ result: AgentTurnResult) {
        guard isActive, result.id == activeTurnID else { return }
        activeTurnID = nil
        switch result.outcome {
        case .completed:
            speak(result.text)
        case .cancelled:
            scheduleListenAgain(expectedSession: sessionID)
        case .failed(let message):
            fail(message)
        }
    }

    private func speak(_ text: String) {
        let spoken = Self.spokenText(text)
        guard !spoken.isEmpty else {
            scheduleListenAgain(expectedSession: sessionID)
            return
        }
        state = .speaking
        let expectedSession = sessionID
        requestTask = Task {
            do {
                let data = try await SupercodeAPIClient.shared.synthesizeVoice(spoken)
                guard !Task.isCancelled, isActive, sessionID == expectedSession else { return }
                let player = try AVAudioPlayer(data: data)
                player.delegate = self
                player.volume = 1
                audioPlayer = player
                guard player.prepareToPlay(), player.play() else {
                    audioPlayer = nil
                    throw VoicePlaybackError.couldNotStart
                }
            } catch {
                guard isActive, sessionID == expectedSession else { return }
                speakWithSystemVoice(spoken, expectedSession: expectedSession)
            }
        }
    }

    private func speakWithSystemVoice(_ text: String, expectedSession: UUID) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
        process.arguments = [text]
        process.terminationHandler = { [weak self] finishedProcess in
            Task { @MainActor in
                guard let self,
                      self.isActive,
                      self.sessionID == expectedSession,
                      self.systemSpeechProcess === finishedProcess else { return }
                self.systemSpeechProcess = nil
                if finishedProcess.terminationStatus == 0 {
                    self.scheduleListenAgain(expectedSession: expectedSession)
                } else {
                    self.fail("The response was generated, but audio playback failed.")
                }
            }
        }
        do {
            systemSpeechProcess = process
            try process.run()
        } catch {
            systemSpeechProcess = nil
            fail("The response was generated, but audio playback failed: \(error.localizedDescription)")
        }
    }

    private func scheduleListenAgain(expectedSession: UUID) {
        guard isActive, sessionID == expectedSession else { return }
        Task {
            try? await Task.sleep(for: .milliseconds(180))
            guard isActive, sessionID == expectedSession else { return }
            listen(expectedSession: expectedSession)
        }
    }

    private func fail(_ message: String) {
        capture.stop()
        inputLevel = 0
        errorMessage = message
        state = .failed(message)
    }

    nonisolated static func spokenText(_ text: String) -> String {
        var value = text
        value = value.replacingOccurrences(of: #"```[\s\S]*?```"#, with: " Code omitted. ", options: .regularExpression)
        value = value.replacingOccurrences(of: #"`([^`]*)`"#, with: "$1", options: .regularExpression)
        value = value.replacingOccurrences(of: #"\[([^\]]+)\]\([^\)]+\)"#, with: "$1", options: .regularExpression)
        value = value.replacingOccurrences(of: #"[*_#>]"#, with: "", options: .regularExpression)
        return String(value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1_500))
    }
}

extension VoiceCallStore: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.isActive else { return }
            self.audioPlayer = nil
            self.scheduleListenAgain(expectedSession: self.sessionID)
        }
    }

}

private enum VoicePlaybackError: Error {
    case couldNotStart
}
