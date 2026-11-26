#if os(macOS)
import SwiftUI

enum ColorCodedPalette {
    static func color(for intensity: Double, smooth: Bool) -> Color {
        let clamped = max(0, min(1, intensity))

        if smooth {
            if clamped < 0.5 {
                let t = clamped / 0.5
                return Color(
                    red: interpolate(from: 0.2, to: 1.0, t: t),
                    green: interpolate(from: 0.8, to: 0.85, t: t),
                    blue: interpolate(from: 0.2, to: 0.1, t: t)
                )
            } else {
                let t = (clamped - 0.5) / 0.5
                return Color(
                    red: interpolate(from: 1.0, to: 1.0, t: t),
                    green: interpolate(from: 0.85, to: 0.2, t: t),
                    blue: interpolate(from: 0.1, to: 0.1, t: t)
                )
            }
        } else {
            if clamped < 0.5 {
                return .green
            } else if clamped < 0.85 {
                return .yellow
            } else {
                return .red
            }
        }
    }

    private static func interpolate(from: Double, to: Double, t: Double) -> Double {
        from + (to - from) * max(0, min(1, t))
    }
}
#endif
