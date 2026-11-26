#if os(macOS)
import SwiftUI

struct PermissionRequestView: View {
    let icon: Image
    let title: String
    let description: String
    let privacyNote: String
    let onAllow: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            icon
                .font(.system(size: 48))
                .foregroundStyle(Color.accentColor)
            Text(title)
                .font(.title2.bold())
            Text(description)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text(privacyNote)
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
            Spacer()
            HStack(spacing: 16) {
                Button("Skip", action: onSkip)
                    .buttonStyle(.bordered)
                Button("Allow", action: onAllow)
                    .buttonStyle(.borderedProminent)
            }
            Spacer()
        }
        .padding(40)
    }
}
#endif
