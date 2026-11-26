#if os(macOS)
import SwiftUI

enum OnboardingProfile: String, CaseIterable {
    case minimal = "Minimal"
    case balanced = "Balanced"
    case full = "Full"
}

struct ProfileSelectionView: View {
    let onContinue: ([OnboardingProfile]) -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "person.crop.rectangle.stack")
                .font(.system(size: 48))
                .foregroundStyle(Color.accentColor)
            Text("Choose Your Profile")
                .font(.title2.bold())
            Text("Pick a preset to get started quickly.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
            Button("Continue") {
                onContinue([.balanced])
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            Spacer()
        }
        .padding(40)
    }
}

func applyProfileSettings(_ profiles: [OnboardingProfile]) {
    // Stub: apply selected profile defaults
}
#endif
