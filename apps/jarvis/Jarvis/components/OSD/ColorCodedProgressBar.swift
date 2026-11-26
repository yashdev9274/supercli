#if os(macOS)
import SwiftUI

enum ColorCodedProgressBar {
    enum Mode {
        case volume
    }

    static func shapeStyle(for value: Double, mode: Mode, smoothGradient: Bool) -> AnyShapeStyle {
        let clamped = max(0, min(1, value))

        if smoothGradient {
            let color = ColorCodedPalette.color(for: clamped, smooth: true)
            return AnyShapeStyle(color)
        } else {
            let color: Color
            if clamped < 0.5 {
                color = .green
            } else if clamped < 0.85 {
                color = .yellow
            } else {
                color = .red
            }
            return AnyShapeStyle(color)
        }
    }
}
#endif
