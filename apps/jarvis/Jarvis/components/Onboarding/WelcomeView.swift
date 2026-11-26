#if os(macOS)
import SwiftUI

struct WelcomeView: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "menubar.rectangle.expand")
                .font(.system(size: 60))
                .foregroundStyle(Color.accentColor)
            Text("Welcome to Jarvis")
                .font(.largeTitle.bold())
            Text("Your dynamic notch companion for macOS.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            Button("Get Started", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            Spacer()
        }
        .padding(40)
    }
}
#endif
