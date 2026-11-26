#if os(macOS)
import SwiftUI

struct MusicControllerSelectionView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "music.note")
                .font(.system(size: 48))
                .foregroundStyle(Color.accentColor)
            Text("Music Integration")
                .font(.title2.bold())
            Text("Choose how Jarvis controls your music.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            Button("Continue", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            Spacer()
        }
        .padding(40)
    }
}
#endif
