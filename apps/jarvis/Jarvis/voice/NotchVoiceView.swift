import SwiftUI

struct NotchVoiceView: View {
    @ObservedObject var voiceManager: VoiceAgentManager
    @State private var pulseAnimation = false
    @State private var showTranscript = false

    var body: some View {
        VStack(spacing: 12) {
            switch voiceManager.state {
            case .idle:
                idleView
            case .listeningWakeWord:
                listeningWakeWordView
            case .listeningCommand:
                listeningCommandView
            case .transcribing:
                transcribingView
            case .processing:
                processingView
            case .speaking:
                speakingView
            case .micDenied:
                micDeniedView
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(width: 320)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                )
        )
        .onAppear {
            if voiceManager.state != .idle {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    pulseAnimation = true
                }
            }
        }
        .onChange(of: voiceManager.state) { _, newState in
            if newState != .idle {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    pulseAnimation = true
                }
            } else {
                pulseAnimation = false
            }
        }
    }

    private var idleView: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.blue)

                Text("Voice Ready")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white)
            }

            Text("Say \"Jarvis\" or press ⌃V")
                .font(.system(size: 11))
                .foregroundColor(.white.opacity(0.6))

            HStack(spacing: 12) {
                Button(action: {
                    voiceManager.startWakeWordListening()
                }) {
                    Label("Wake Word", systemImage: "waveform")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(Color.blue.opacity(0.6))
                        )
                }
                .buttonStyle(.plain)

                Button(action: {
                    voiceManager.startPushToTalk()
                }) {
                    Label("Push to Talk", systemImage: "mic")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(Color.purple.opacity(0.6))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var listeningWakeWordView: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(Color.blue.opacity(0.3))
                    .frame(width: 40, height: 40)
                    .scaleEffect(pulseAnimation ? 1.5 : 0.8)
                    .opacity(pulseAnimation ? 0.0 : 1.0)

                Circle()
                    .fill(Color.blue)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: "waveform")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    )
            }

            Text("Listening for \"Jarvis\"...")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))

            Button(action: {
                voiceManager.cancel()
            }) {
                Text("Cancel")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
        }
    }

    private var listeningCommandView: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.3))
                    .frame(width: 40, height: 40)
                    .scaleEffect(pulseAnimation ? 1.5 : 0.8)
                    .opacity(pulseAnimation ? 0.0 : 1.0)

                Circle()
                    .fill(Color.green)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: "mic.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    )
            }

            Text("Speak now...")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))

            waveformView

            Button(action: {
                voiceManager.cancel()
            }) {
                Text("Cancel")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
        }
    }

    private var transcribingView: some View {
        VStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.8)
                .tint(.white)

            Text("Transcribing...")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
        }
    }

    private var processingView: some View {
        VStack(spacing: 8) {
            ProgressView()
                .scaleEffect(0.8)
                .tint(.white)

            Text("Thinking...")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))

            if !voiceManager.transcript.isEmpty {
                Text("\"\(voiceManager.transcript)\"")
                    .font(.system(size: 10))
                    .foregroundColor(.white.opacity(0.5))
                    .lineLimit(2)
            }
        }
    }

    private var speakingView: some View {
        VStack(spacing: 8) {
            ZStack {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Color.cyan.opacity(0.3))
                        .frame(width: 40, height: 40)
                        .scaleEffect(pulseAnimation ? 1.5 : 0.8)
                        .opacity(pulseAnimation ? 0.0 : 1.0)
                        .animation(
                            .easeInOut(duration: 1)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.2),
                            value: pulseAnimation
                        )
                }

                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.cyan)
            }

            if !voiceManager.response.isEmpty {
                ScrollView(.vertical, showsIndicators: false) {
                    Text(voiceManager.response)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxHeight: 80)
            }
        }
    }

    private var micDeniedView: some View {
        VStack(spacing: 8) {
            Image(systemName: "mic.slash.fill")
                .font(.system(size: 20))
                .foregroundColor(.red)

            Text("Microphone access is blocked")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.9))

            Text("Enable the microphone for JARVIS in System Settings, then press ⌃V again.")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.6))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Button(action: openMicrophoneSettings) {
                Label("Open Settings", systemImage: "gearshape.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(Color.red.opacity(0.6))
                    )
            }
            .buttonStyle(.plain)

            Button(action: {
                voiceManager.cancel()
            }) {
                Text("Cancel")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            .buttonStyle(.plain)
        }
    }

    private func openMicrophoneSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") {
            NSWorkspace.shared.open(url)
        }
    }

    private var waveformView: some View {
        HStack(spacing: 2) {
            ForEach(0..<12, id: \.self) { i in
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.green.opacity(0.8))
                    .frame(width: 2, height: CGFloat.random(in: 4...20))
                    .animation(
                        .easeInOut(duration: 0.3)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.05),
                        value: voiceManager.inputLevel
                    )
            }
        }
        .frame(height: 24)
        .opacity(voiceManager.state == .listeningCommand ? 1 : 0.3)
    }
}
