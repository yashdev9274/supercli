import SwiftUI

struct VoiceCallBar: View {
    @EnvironmentObject private var voice: VoiceCallStore

    var body: some View {
        HStack(spacing: 12) {
            waveform

            VStack(alignment: .leading, spacing: 3) {
                Text(voice.state.label)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(DesktopTheme.textPrimary)
                Text(detail)
                    .font(.system(size: 11))
                    .foregroundStyle(voice.errorMessage == nil ? DesktopTheme.textMuted : DesktopTheme.danger)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if case .failed = voice.state {
                Button("Settings") { voice.openMicrophoneSettings() }
                    .buttonStyle(.plain)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(DesktopTheme.accent)
            }

            callButton(
                symbol: voice.state == .muted ? "mic.slash.fill" : "mic.fill",
                help: voice.state == .muted ? "Unmute" : "Mute",
                color: voice.state == .muted ? DesktopTheme.danger : DesktopTheme.textSecondary,
                action: voice.toggleMute
            )

            if voice.state == .speaking || voice.state == .thinking {
                callButton(
                    symbol: "waveform.and.mic",
                    help: "Interrupt and speak",
                    color: DesktopTheme.accent,
                    action: voice.interruptAndListen
                )
            }

            Button {
                voice.endCall()
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(DesktopTheme.danger))
            }
            .buttonStyle(.plain)
            .help("End voice call")
            .accessibilityLabel("End voice call")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(DesktopTheme.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(DesktopTheme.accent.opacity(0.35), lineWidth: 1)
                )
        )
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    private var waveform: some View {
        HStack(alignment: .center, spacing: 2) {
            ForEach(0..<7, id: \.self) { index in
                Capsule()
                    .fill(voice.state == .listening ? DesktopTheme.accent : DesktopTheme.textMuted)
                    .frame(width: 2.5, height: barHeight(index))
            }
        }
        .frame(width: 28, height: 28)
        .accessibilityHidden(true)
    }

    private var detail: String {
        if let errorMessage = voice.errorMessage { return errorMessage }
        if !voice.transcript.isEmpty, voice.state != .listening {
            return "“\(voice.transcript)”"
        }
        switch voice.state {
        case .listening: return "Speak naturally. I’ll respond after you pause."
        case .thinking: return "You can interrupt at any time."
        case .speaking: return "Click the waveform button to jump in."
        case .muted: return "Unmute when you’re ready."
        default: return "Connected to this chat"
        }
    }

    private func barHeight(_ index: Int) -> CGFloat {
        let pattern: [CGFloat] = [0.45, 0.7, 1, 0.62, 0.88, 0.55, 0.76]
        let active = CGFloat(max(voice.inputLevel, 0.12))
        return 5 + 18 * pattern[index] * (voice.state == .listening ? active : 0.35)
    }

    private func callButton(
        symbol: String,
        help: String,
        color: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 30, height: 30)
                .background(Circle().fill(DesktopTheme.panelElevated))
                .overlay(Circle().stroke(DesktopTheme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(help)
    }
}
