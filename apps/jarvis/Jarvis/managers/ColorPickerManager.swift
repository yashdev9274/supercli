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
import Cocoa
import CoreGraphics
import Defaults

// MARK: - NSColor Extensions from Solid
extension NSColor {
    var hexString: String {
        let red = Int((redComponent * 255).rounded())
        let green = Int((greenComponent * 255).rounded())
        let blue = Int((blueComponent * 255).rounded())
        let alpha = Int((alphaComponent * 255).rounded())

        if alpha == 255 {
            return String(format: "%02x%02x%02x", red, green, blue)
        } else {
            return String(format: "%02x%02x%02x%02x", red, green, blue, alpha)
        }
    }
}

// MARK: - Color Formatter from Solid
struct ColorFormatter {
    static let shared = ColorFormatter()

    func hex(
        color: NSColor,
        includeHashPrefix: Bool = true,
        lowerCaseHex: Bool = false
    ) -> String {
        let prefix = includeHashPrefix ? "#" : ""
        let hex = (prefix + color.hexString)
        
        if lowerCaseHex {
            return hex
        } else {
            return hex.uppercased()
        }
    }
}

class ColorPickerManager: ObservableObject {
    static let shared = ColorPickerManager()
    
    @Published var colorHistory: [PickedColor] = []
    @Published var isPickingColor: Bool = false
    @Published var isShowingPanel: Bool = false
    @Published var showColorPickedFeedback: Bool = false
    @Published var lastPickedColor: PickedColor?
    
    // Use NSColorSampler from Solid project - much more reliable
    private let colorSampler = NSColorSampler()
    
    private init() {
        loadColorHistory()
    }
    
    // MARK: - Public Interface
    
    func toggleColorPicker() {
        if isPickingColor {
            stopColorPicking()
        } else {
            startColorPicking()
        }
    }
    
    func startColorPicking() {
        guard !isPickingColor else { return }
        
        print("ColorPicker: Starting color picking with NSColorSampler...")
        
        isPickingColor = true
        isShowingPanel = false
        showColorPickedFeedback = false
        
        // Use NSColorSampler like Solid project - much cleaner and more reliable
        colorSampler.show { [weak self] pickedColor in
            guard let self = self else { return }
            
            DispatchQueue.main.async {
                self.isPickingColor = false
                
                if let color = pickedColor {
                    print("ColorPicker: Successfully picked color - R:\(color.redComponent) G:\(color.greenComponent) B:\(color.blueComponent)")
                    
                    // Convert to sRGB for consistent color handling
                    if let sRGBColor = color.usingColorSpace(.sRGB) {
                        let pickedColor = PickedColor(nsColor: sRGBColor, point: NSEvent.mouseLocation)
                        self.addColor(pickedColor)
                        self.showColorPickedFeedback(for: pickedColor)
                        
                        // Provide haptic feedback if enabled
                        if Defaults[.enableHaptics] {
                            NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .default)
                        }
                    }
                } else {
                    print("ColorPicker: Color picking cancelled by user")
                }
            }
        }
    }
    
    func stopColorPicking() {
        print("ColorPicker: Stopping color picking...")
        isPickingColor = false
    }
    
    func togglePanel() {
        isShowingPanel.toggle()
    }
    
    // MARK: - Color Feedback
    
    private func showColorPickedFeedback(for color: PickedColor) {
        print("ColorPicker: Showing color picked feedback for \(color.hexString)")
        lastPickedColor = color
        showColorPickedFeedback = true
        
        // Reopen the ColorPicker panel after color is picked
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            ColorPickerPanelManager.shared.showColorPickerPanel()
        }
        
        // Hide feedback after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            print("ColorPicker: Hiding color picked feedback")
            self.showColorPickedFeedback = false
        }
    }
    
    // MARK: - Color History Management
    
    func addColor(_ color: PickedColor) {
        // Remove if already exists to avoid duplicates
        colorHistory.removeAll { $0.id == color.id }
        
        // Add to beginning of list
        colorHistory.insert(color, at: 0)
        
        // Limit history size
        if colorHistory.count > 50 {
            colorHistory = Array(colorHistory.prefix(50))
        }
        
        saveColorHistory()
        
        // Always copy to clipboard for now (can be made configurable later if needed)
        copyToClipboard(color.hexString)
    }
    
    func removeColor(_ color: PickedColor) {
        colorHistory.removeAll { $0.id == color.id }
        saveColorHistory()
    }
    
    func clearHistory() {
        colorHistory.removeAll()
        saveColorHistory()
    }
    
    func copyToClipboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        
        // Always show confirmation in console for now
        print("Copied to clipboard: \(text)")
    }
    
    func copyColorToClipboard(_ color: PickedColor, format: ColorFormat) {
        copyToClipboard(format.copyValue)
    }
    
    // MARK: - Persistence
    
    private func saveColorHistory() {
        if let encoded = try? JSONEncoder().encode(colorHistory) {
            UserDefaults.standard.set(encoded, forKey: "ColorPickerHistory")
        }
    }
    
    private func loadColorHistory() {
        guard let data = UserDefaults.standard.data(forKey: "ColorPickerHistory"),
              let decoded = try? JSONDecoder().decode([PickedColor].self, from: data) else {
            return
        }
        
        colorHistory = decoded
    }
}
