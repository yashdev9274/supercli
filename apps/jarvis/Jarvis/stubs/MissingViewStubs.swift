#if os(macOS)
import Foundation
import SwiftUI
import Sparkle

// MARK: - Distributed Notifications Stub
struct JARVISDistributedNotifications {
    struct UserInfoKey {
        static let sourcePID = "sourcePID"
    }
    static let didBecomeIdle = Notification.Name("com.jarvis.didBecomeIdle")
    static let didBecomeActive = Notification.Name("com.jarvis.didBecomeActive")
}

// MARK: - Missing Views
struct NotchLLMUsageView: View {
    var body: some View {
        Text("LLM Usage")
            .padding()
    }
}

struct NotchTerminalView: View {
    var body: some View {
        Text("Terminal")
            .padding()
    }
}

struct IdleAnimationView: View {
    var body: some View {
        Color.clear
    }
}

// MARK: - InlineHUD Stub
struct InlineHUD: View {
    @Binding var type: SneakContentType
    @Binding var value: CGFloat
    @Binding var icon: String
    @Binding var hoverAnimation: Bool
    @Binding var gestureProgress: CGFloat

    init(
        type: Binding<SneakContentType>,
        value: Binding<CGFloat>,
        icon: Binding<String>,
        hoverAnimation: Binding<Bool>,
        gestureProgress: Binding<CGFloat>
    ) {
        self._type = type
        self._value = value
        self._icon = icon
        self._hoverAnimation = hoverAnimation
        self._gestureProgress = gestureProgress
    }

    static func airPodsListeningModeWidth(
        closedNotchWidth: CGFloat,
        gestureProgress: Double,
        minimalistic: Bool
    ) -> CGFloat {
        return closedNotchWidth + 80
    }

    var body: some View {
        HStack(spacing: 4) {
            if !icon.isEmpty {
                Image(systemName: icon)
            }
            Text("\(Int(value * 100))%")
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }
}

// MARK: - BatteryTemporaryActivityView Stub

struct BatteryTemporaryActivityView: View {
    let kind: BatteryTemporaryHUDKind
    let batteryLevel: Int
    let isLowPowerMode: Bool
    let closedNotchWidth: CGFloat
    let baseHeight: CGFloat
    let isJarvisMode: Bool
    let topCornerRadius: CGFloat
    let styleOverride: Any?

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: kind == .charging ? "bolt.fill" : "battery.100percent")
            Text("\(batteryLevel)%")
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }
}

struct SystemEventIndicatorModifier: View {
    @Binding var eventType: SneakContentType
    @Binding var value: CGFloat
    @Binding var icon: String
    let sendEventBack: (Any) -> Void

    var body: some View {
        HStack(spacing: 4) {
            if !icon.isEmpty {
                Image(systemName: icon)
            }
            Text("\(Int(value * 100))%")
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }
}

// MARK: - CheckForUpdates View
struct CheckForUpdatesView: View {
    let updater: SPUUpdater?

    init(updater: SPUUpdater? = nil) {
        self.updater = updater
    }

    var body: some View {
        Text("Check for Updates")
    }
}

// MARK: - LottieAnimationView Stub
struct LottieAnimationView: NSViewRepresentable {
    let animationName: String
    let loopMode: Bool
    let animationSpeed: CGFloat

    init(animationName: String = "default", loopMode: Bool = true, animationSpeed: CGFloat = 1.0) {
        self.animationName = animationName
        self.loopMode = loopMode
        self.animationSpeed = animationSpeed
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        let label = NSTextField(labelWithString: "Loading...")
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

// MARK: - LockScreenLiveActivityWindowManager Configure
extension LockScreenLiveActivityWindowManager {
    func configure(viewModel: Any) {}
}
#endif
