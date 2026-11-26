/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
 *
 * Originally from boring.notch project
 * Modified and adapted for JARVIS (Jarvis)
 * See NOTICE for details.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import SwiftUI

/// Cursor companion: follows the system cursor (rendered on its bottom-right
/// side) and renders the voice conversation with the same visual language as
/// the Dynamic Island (`NotchVoiceView`). Collapses to a globe while idle.
struct CursorCompanionView: View {
    @ObservedObject var voiceManager: VoiceAgentManager
    @State private var pulseAnimation = false

    var body: some View {
        Group {
            if voiceManager.isConversationVisible {
                conversationBubble
                    .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .topLeading)))
            } else {
                globeOrb
                    .transition(.opacity.combined(with: .scale(scale: 0.85)))
            }
        }
        .animation(.smooth(duration: 0.25), value: voiceManager.isConversationVisible)
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

    // MARK: - Idle globe

    private var globeOrb: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(red: 0.45, green: 0.82, blue: 1.0),
                            Color(red: 0.10, green: 0.45, blue: 0.85),
                            Color(red: 0.04, green: 0.20, blue: 0.45),
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: 20
                    )
                )
                .frame(width: 22, height: 22)
                .shadow(color: Color.cyan.opacity(0.4), radius: 6, y: 1)

            Circle()
                .fill(Color(red: 0.10, green: 0.55, blue: 0.30).opacity(0.85))
                .frame(width: 9, height: 6)
                .offset(x: -4, y: 2)

            Circle()
                .fill(Color(red: 0.10, green: 0.55, blue: 0.30).opacity(0.7))
                .frame(width: 6, height: 5)
                .offset(x: 5, y: -4)

            Circle()
                .fill(Color(red: 0.10, green: 0.55, blue: 0.30).opacity(0.6))
                .frame(width: 5, height: 6)
                .offset(x: 1, y: 6)

            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.white.opacity(0.45), .clear],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: 12
                    )
                )
                .frame(width: 22, height: 22)
        }
        .clipShape(Circle())
        .overlay(
            Circle()
                .stroke(Color.white.opacity(0.3), lineWidth: 0.5)
        )
        .frame(width: 22, height: 22)
        .padding(7)
    }

    private var miniGlobe: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(red: 0.45, green: 0.82, blue: 1.0),
                            Color(red: 0.10, green: 0.45, blue: 0.85),
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: 9
                    )
                )
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.white.opacity(0.4), .clear],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: 7
                    )
                )
        }
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 0.5))
        .frame(width: 14, height: 14)
    }

    // MARK: - Conversation bubble

    private var conversationBubble: some View {
        VStack(spacing: 10) {
            header
            switch voiceManager.state {
            case .idle:
                EmptyView()
            case .listeningWakeWord:
                listeningView(color: .blue, icon: "waveform", text: "Listening for \"Jarvis\"...", showWaveform: false)
            case .listeningCommand:
                listeningView(color: .green, icon: "mic.fill", text: "Speak now...", showWaveform: true)
            case .transcribing:
                transcribingView
            case .processing:
                processingView
            case .speaking:
                speakingView
            case .micDenied:
                listeningView(color: .red, icon: "mic.slash.fill", text: "Microphone blocked", showWaveform: false)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(width: 280)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.1), lineWidth: 0.5)
                )
        )
    }

    private var header: some View {
        HStack(spacing: 6) {
            miniGlobe
            Text("Jarvis")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white.opacity(0.9))
            Spacer(minLength: 0)
            Circle()
                .fill(stateColor)
                .frame(width: 5, height: 5)
        }
        .padding(.bottom, 2)
    }

    private var stateColor: Color {
        switch voiceManager.state {
        case .idle: return .white.opacity(0.3)
        case .listeningWakeWord: return .blue
        case .listeningCommand: return .green
        case .transcribing: return .orange
        case .processing: return .orange
        case .speaking: return .cyan
        case .micDenied: return .red
        }
    }

    private var userMessageCapsule: some View {
        HStack {
            Spacer(minLength: 14)
            Text(voiceManager.transcript)
                .font(.system(size: 11))
                .foregroundColor(.white)
                .lineLimit(2)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(
                    Capsule()
                        .fill(Color.blue.opacity(0.3))
                        .overlay(
                            Capsule()
                                .stroke(Color.blue.opacity(0.25), lineWidth: 0.5)
                        )
                )
        }
    }

    private func listeningView(color: Color, icon: String, text: String, showWaveform: Bool) -> some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.3))
                    .frame(width: 40, height: 40)
                    .scaleEffect(pulseAnimation ? 1.5 : 0.8)
                    .opacity(pulseAnimation ? 0.0 : 1.0)

                Circle()
                    .fill(color)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Image(systemName: icon)
                            .font(.system(size: 14))
                            .foregroundColor(.white)
                    )
            }

            Text(text)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.8))

            if showWaveform {
                waveformView
            }
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
        VStack(spacing: 10) {
            if !voiceManager.transcript.isEmpty {
                userMessageCapsule
            }
            HStack(spacing: 8) {
                ProgressView()
                    .controlSize(.small)
                    .tint(.white)
                Text("Thinking...")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                Spacer(minLength: 0)
            }
        }
    }

    private var speakingView: some View {
        VStack(spacing: 10) {
            if !voiceManager.transcript.isEmpty {
                userMessageCapsule
            }
            HStack(alignment: .top, spacing: 8) {
                ZStack {
                    ForEach(0..<3, id: \.self) { i in
                        Circle()
                            .fill(Color.cyan.opacity(0.3))
                            .frame(width: 22, height: 22)
                            .scaleEffect(pulseAnimation ? 1.8 : 0.7)
                            .opacity(pulseAnimation ? 0.0 : 1.0)
                            .animation(
                                .easeInOut(duration: 1)
                                    .repeatForever(autoreverses: true)
                                    .delay(Double(i) * 0.2),
                                value: pulseAnimation
                            )
                    }
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.cyan)
                }
                .frame(width: 24, height: 24)

                if !voiceManager.response.isEmpty {
                    ScrollView(.vertical, showsIndicators: false) {
                        Text(voiceManager.response)
                            .font(.system(size: 11))
                            .foregroundColor(.white.opacity(0.85))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxHeight: 80)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.white.opacity(0.08))
                    )
                }
                Spacer(minLength: 0)
            }
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