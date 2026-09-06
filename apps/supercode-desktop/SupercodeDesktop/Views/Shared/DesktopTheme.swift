import SwiftUI

enum DesktopTheme {
    static let background = Color(red: 0.06, green: 0.06, blue: 0.07)
    static let panel = Color(red: 0.09, green: 0.09, blue: 0.10)
    static let panelElevated = Color(red: 0.11, green: 0.11, blue: 0.12)
    static let border = Color.white.opacity(0.08)
    static let borderStrong = Color.white.opacity(0.14)
    static let textPrimary = Color(red: 0.92, green: 0.92, blue: 0.93)
    static let textSecondary = Color(red: 0.62, green: 0.62, blue: 0.65)
    static let textMuted = Color(red: 0.42, green: 0.42, blue: 0.45)
    static let accent = Color(red: 0.96, green: 0.62, blue: 0.18)
    static let accentSoft = Color(red: 0.96, green: 0.62, blue: 0.18).opacity(0.15)
    static let userBubble = Color(red: 0.16, green: 0.16, blue: 0.18)
    static let success = Color(red: 0.30, green: 0.78, blue: 0.47)
    static let danger = Color(red: 0.94, green: 0.33, blue: 0.31)
    static let add = Color(red: 0.20, green: 0.55, blue: 0.30).opacity(0.35)
    static let remove = Color(red: 0.70, green: 0.22, blue: 0.22).opacity(0.35)
    static let mono = Font.system(.body, design: .monospaced)
    static let monoSmall = Font.system(size: 11, weight: .regular, design: .monospaced)
    static let monoTiny = Font.system(size: 10, weight: .medium, design: .monospaced)
    static let sidebarWidth: CGFloat = 250
    static let inspectorMinWidth: CGFloat = 280
    static let inspectorDefaultWidth: CGFloat = 300
}

struct DashedCardBackground: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .foregroundStyle(DesktopTheme.borderStrong)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(DesktopTheme.panelElevated)
            )
    }
}
