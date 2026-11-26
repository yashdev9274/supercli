/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import SwiftUI
import Foundation
import Defaults

struct PickedColor: Identifiable, Codable, Hashable, Defaults.Serializable {
    let id = UUID()
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double
    let timestamp: Date
    let displayPoint: CGPoint
    
    // Computed properties for different color formats
    var nsColor: NSColor {
        NSColor(red: red, green: green, blue: blue, alpha: alpha)
    }
    
    var color: Color {
        Color(red: red, green: green, blue: blue, opacity: alpha)
    }
    
    var hexString: String {
        let r = Int(red * 255)
        let g = Int(green * 255)
        let b = Int(blue * 255)
        
        if alpha < 1.0 {
            let a = Int(alpha * 255)
            return String(format: "#%02X%02X%02X%02X", r, g, b, a)
        } else {
            return String(format: "#%02X%02X%02X", r, g, b)
        }
    }
    
    var rgbString: String {
        let r = Int(red * 255)
        let g = Int(green * 255)
        let b = Int(blue * 255)
        return "rgb(\(r), \(g), \(b))"
    }
    
    var rgbaString: String {
        let r = Int(red * 255)
        let g = Int(green * 255)
        let b = Int(blue * 255)
        return String(format: "rgba(%d, %d, %d, %.2f)", r, g, b, alpha)
    }
    
    var hslString: String {
        let (h, s, l) = rgbToHsl(red: red, green: green, blue: blue)
        return String(format: "hsl(%.0f, %.0f%%, %.0f%%)", h, s * 100, l * 100)
    }
    
    var hslaString: String {
        let (h, s, l) = rgbToHsl(red: red, green: green, blue: blue)
        return String(format: "hsla(%.0f, %.0f%%, %.0f%%, %.2f)", h, s * 100, l * 100, alpha)
    }
    
    var hsvString: String {
        let (h, s, v) = rgbToHsv(red: red, green: green, blue: blue)
        return String(format: "hsv(%.0f, %.0f%%, %.0f%%)", h, s * 100, v * 100)
    }
    
    var swiftUIString: String {
        return String(format: "Color(red: %.3f, green: %.3f, blue: %.3f, opacity: %.3f)", red, green, blue, alpha)
    }
    
    var uiColorString: String {
        return String(format: "UIColor(red: %.3f, green: %.3f, blue: %.3f, alpha: %.3f)", red, green, blue, alpha)
    }
    
    var allFormats: [ColorFormat] {
        return [
            ColorFormat(name: "HEX", value: hexString, copyValue: hexString),
            ColorFormat(name: "RGB", value: rgbString, copyValue: rgbString),
            ColorFormat(name: "RGBA", value: rgbaString, copyValue: rgbaString),
            ColorFormat(name: "HSL", value: hslString, copyValue: hslString),
            ColorFormat(name: "HSLA", value: hslaString, copyValue: hslaString),
            ColorFormat(name: "HSV", value: hsvString, copyValue: hsvString),
            ColorFormat(name: "SwiftUI", value: swiftUIString, copyValue: swiftUIString),
            ColorFormat(name: "UIColor", value: uiColorString, copyValue: uiColorString)
        ]
    }
    
    init(nsColor: NSColor, point: CGPoint) {
        let rgba = nsColor.usingColorSpace(.sRGB) ?? nsColor
        self.red = Double(rgba.redComponent)
        self.green = Double(rgba.greenComponent)
        self.blue = Double(rgba.blueComponent)
        self.alpha = Double(rgba.alphaComponent)
        self.timestamp = Date()
        self.displayPoint = point
    }
    
    init(red: Double, green: Double, blue: Double, alpha: Double = 1.0, point: CGPoint) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
        self.timestamp = Date()
        self.displayPoint = point
    }
    
    // Helper functions for color space conversion
    private func rgbToHsl(red: Double, green: Double, blue: Double) -> (h: Double, s: Double, l: Double) {
        let max = Swift.max(red, green, blue)
        let min = Swift.min(red, green, blue)
        
        let lightness = (max + min) / 2
        
        if max == min {
            return (0, 0, lightness) // achromatic
        }
        
        let delta = max - min
        let saturation: Double
        
        if lightness > 0.5 {
            saturation = delta / (2 - max - min)
        } else {
            saturation = delta / (max + min)
        }
        
        var hue: Double
        switch max {
        case red:
            hue = (green - blue) / delta + (green < blue ? 6 : 0)
        case green:
            hue = (blue - red) / delta + 2
        case blue:
            hue = (red - green) / delta + 4
        default:
            hue = 0
        }
        
        hue *= 60
        
        return (hue, saturation, lightness)
    }
    
    private func rgbToHsv(red: Double, green: Double, blue: Double) -> (h: Double, s: Double, v: Double) {
        let max = Swift.max(red, green, blue)
        let min = Swift.min(red, green, blue)
        
        let value = max
        let delta = max - min
        
        let saturation = max == 0 ? 0 : delta / max
        
        if delta == 0 {
            return (0, saturation, value) // achromatic
        }
        
        var hue: Double
        switch max {
        case red:
            hue = (green - blue) / delta + (green < blue ? 6 : 0)
        case green:
            hue = (blue - red) / delta + 2
        case blue:
            hue = (red - green) / delta + 4
        default:
            hue = 0
        }
        
        hue *= 60
        
        return (hue, saturation, value)
    }
}

struct ColorFormat: Identifiable {
    let id = UUID()
    let name: String
    let value: String
    let copyValue: String
}

// Extension for preview/testing
extension PickedColor {
    static var sampleColors: [PickedColor] {
        return [
            PickedColor(red: 1.0, green: 0.0, blue: 0.0, point: CGPoint(x: 100, y: 100)),
            PickedColor(red: 0.0, green: 1.0, blue: 0.0, point: CGPoint(x: 200, y: 100)),
            PickedColor(red: 0.0, green: 0.0, blue: 1.0, point: CGPoint(x: 300, y: 100)),
            PickedColor(red: 1.0, green: 1.0, blue: 0.0, point: CGPoint(x: 400, y: 100)),
            PickedColor(red: 1.0, green: 0.0, blue: 1.0, point: CGPoint(x: 500, y: 100))
        ]
    }
}
