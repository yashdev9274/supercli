#if os(macOS)
import SwiftUI

struct OnboardingFinishView: View {
    let onFinish: () -> Void
    let onOpenSettings: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.green)
            Text("You're All Set!")
                .font(.largeTitle.bold())
            Text("Jarvis is ready to use.")
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 16) {
                Button("Open Settings", action: onOpenSettings)
                    .buttonStyle(.bordered)
                Button("Done", action: onFinish)
                    .buttonStyle(.borderedProminent)
            }
            Spacer()
        }
        .padding(40)
    }
}
#endif
