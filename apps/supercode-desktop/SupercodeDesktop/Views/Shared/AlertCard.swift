import SwiftUI

enum AlertTone {
    case info
    case warning
    case danger
    case success

    var accent: Color {
        switch self {
        case .info: return DesktopTheme.accent
        case .warning: return Color(red: 0.95, green: 0.72, blue: 0.20)
        case .danger: return DesktopTheme.danger
        case .success: return DesktopTheme.success
        }
    }

    var icon: String {
        switch self {
        case .info: return "info.circle.fill"
        case .warning: return "exclamationmark.triangle.fill"
        case .danger: return "xmark.octagon.fill"
        case .success: return "checkmark.circle.fill"
        }
    }
}

/// Inline alert card for credits / plan / stream errors (replaces plain error text).
struct AlertCard: View {
    let title: String
    let message: String
    var tone: AlertTone = .warning
    var primaryActionTitle: String? = nil
    var primaryAction: (() -> Void)? = nil
    var secondaryActionTitle: String? = nil
    var secondaryAction: (() -> Void)? = nil
    var onDismiss: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: tone.icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tone.accent)
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(DesktopTheme.textPrimary)
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundStyle(DesktopTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                if let onDismiss {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(DesktopTheme.textMuted)
                            .padding(6)
                            .background(Circle().fill(DesktopTheme.background))
                    }
                    .buttonStyle(.plain)
                    .help("Dismiss")
                }
            }

            if primaryActionTitle != nil || secondaryActionTitle != nil {
                HStack(spacing: 8) {
                    if let secondaryActionTitle, let secondaryAction {
                        Button(secondaryActionTitle, action: secondaryAction)
                            .buttonStyle(.plain)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(DesktopTheme.textSecondary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .stroke(DesktopTheme.borderStrong, lineWidth: 1)
                            )
                    }
                    Spacer()
                    if let primaryActionTitle, let primaryAction {
                        Button(primaryActionTitle, action: primaryAction)
                            .buttonStyle(.plain)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.black)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(tone.accent))
                    }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(DesktopTheme.panel)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(tone.accent.opacity(0.45), lineWidth: 1)
                )
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(tone.accent)
                .frame(width: 3)
                .padding(.vertical, 8)
                .padding(.leading, 1)
        }
    }
}

enum AgentAlertKind: Equatable {
    case lowCredits(remainingCents: Double, limitCents: Double)
    case planLimit(message: String)
    case streamError(message: String)
    case info(title: String, message: String)

    var title: String {
        switch self {
        case .lowCredits: return "Low credits"
        case .planLimit: return "Plan limit"
        case .streamError: return "Agent error"
        case .info(let title, _): return title
        }
    }

    var message: String {
        switch self {
        case .lowCredits(let remaining, let limit):
            let left = String(format: "$%.2f", remaining / 100.0)
            let total = String(format: "$%.2f", limit / 100.0)
            return "You have \(left) of \(total) credits left this period. Chat still works, but heavy tool use may run out sooner."
        case .planLimit(let message), .streamError(let message):
            return message
        case .info(_, let message):
            return message
        }
    }

    var tone: AlertTone {
        switch self {
        case .lowCredits: return .warning
        case .planLimit: return .danger
        case .streamError: return .danger
        case .info: return .info
        }
    }
}
