/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
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
import Defaults

struct NotchColorPickerView: View {
    @ObservedObject var colorPickerManager = ColorPickerManager.shared
    @Default(.enableColorPickerFeature) var enableColorPickerFeature
    @State private var hoveredColorId: UUID?
    @State private var showColorInfo: Bool = false
    @State private var selectedColor: PickedColor?
    
    var body: some View {
        if !enableColorPickerFeature {
            disabledStateView
        } else {
            colorPickerContent
        }
    }
    
    private var disabledStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "eyedropper.halffull")
                .font(.system(size: 32))
                .foregroundColor(.secondary)
            
            Text("ColorPicker Disabled")
                .font(.headline)
                .foregroundColor(.primary)
            
            Text("Enable ColorPicker in Settings → ColorPicker")
                .font(.caption)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    
    private var colorPickerContent: some View {
        VStack(spacing: 16) {
            headerSection
            
            if colorPickerManager.colorHistory.isEmpty {
                emptyStateView
            } else {
                colorHistoryGrid
            }
            
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(
            colorInfoOverlay,
            alignment: .topTrailing
        )
    }
    
    private var headerSection: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Image(systemName: "eyedropper.halffull")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.primary)
                    
                    Text("Recent Colors")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                }
                
                Text("\(colorPickerManager.colorHistory.count) colors")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            // Pick Color Button
            Button(action: {
                colorPickerManager.startColorPicking()
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 12, weight: .medium))
                    Text("Pick Color")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.blue)
                .cornerRadius(8)
            }
            .buttonStyle(PlainButtonStyle())
            .onHover { isHovering in
                if isHovering {
                    NSCursor.pointingHand.push()
                } else {
                    NSCursor.pop()
                }
            }
        }
    }
    
    private var emptyStateView: some View {
        VStack(spacing: 12) {
            Image(systemName: "eyedropper")
                .font(.system(size: 28))
                .foregroundColor(.secondary)
            
            Text("No Colors Yet")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.primary)
            
            Text("Click 'Pick Color' or use Cmd+Shift+P to start picking colors")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
    
    private var colorHistoryGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: 12) {
            ForEach(colorPickerManager.colorHistory.prefix(15)) { color in
                ColorCircleView(
                    color: color,
                    isHovered: hoveredColorId == color.id
                )
                .onHover { isHovering in
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isHovering {
                            hoveredColorId = color.id
                            selectedColor = color
                            showColorInfo = true
                        } else {
                            hoveredColorId = nil
                            if selectedColor?.id == color.id {
                                showColorInfo = false
                                selectedColor = nil
                            }
                        }
                    }
                }
                .onTapGesture {
                    // Copy hex color to clipboard
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.setString(color.hexString, forType: .string)
                    
                    // Provide haptic feedback
                    if Defaults[.enableHaptics] {
                        NSHapticFeedbackManager.defaultPerformer.perform(.generic, performanceTime: .default)
                    }
                }
            }
        }
        .padding(.horizontal, 8)
    }
    
    private var gridColumns: [GridItem] {
        let availableWidth: CGFloat = 400 // Approximate notch content width
        let circleSize: CGFloat = 32
        let spacing: CGFloat = 12
        let maxColumns = Int((availableWidth + spacing) / (circleSize + spacing))
        let columns = min(maxColumns, 8) // Maximum 8 columns
        
        return Array(repeating: GridItem(.fixed(circleSize), spacing: spacing), count: columns)
    }
    
    private var colorInfoOverlay: some View {
        Group {
            if showColorInfo, let color = selectedColor {
                ColorInfoPopup(color: color)
                    .transition(.asymmetric(
                        insertion: .scale.combined(with: .opacity),
                        removal: .opacity
                    ))
            }
        }
    }
}

struct ColorCircleView: View {
    let color: PickedColor
    let isHovered: Bool
    
    var body: some View {
        ZStack {
            // Color circle
            Circle()
                .fill(color.color)
                .frame(width: 32, height: 32)
                .overlay(
                    Circle()
                        .stroke(Color.white.opacity(0.8), lineWidth: isHovered ? 2 : 1)
                )
                .overlay(
                    Circle()
                        .stroke(Color.black.opacity(0.2), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: isHovered ? 4 : 2, x: 0, y: isHovered ? 2 : 1)
                .scaleEffect(isHovered ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.2), value: isHovered)
        }
        .frame(width: 32, height: 32)
    }
}

struct ColorInfoPopup: View {
    let color: PickedColor
    @Default(.showColorFormats) var showColorFormats
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header with color preview
            HStack(spacing: 8) {
                Circle()
                    .fill(color.color)
                    .frame(width: 24, height: 24)
                    .overlay(
                        Circle()
                            .stroke(Color.white.opacity(0.8), lineWidth: 1)
                    )
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Picked Color")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.primary)
                    
                    Text(timeAgoString(from: color.timestamp))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
                
                Spacer()
            }
            
            Divider()
                .background(Color.gray.opacity(0.3))
            
            // Color formats
            if showColorFormats {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(color.allFormats.prefix(4)) { format in
                        ColorFormatRow(format: format, color: color)
                    }
                }
            } else {
                ColorFormatRow(
                    format: ColorFormat(name: "HEX", value: color.hexString, copyValue: color.hexString),
                    color: color
                )
            }
        }
        .padding(12)
        .frame(width: 220)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.gray.opacity(0.3), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.4), radius: 15, x: 0, y: 8)
    }
    
    private func timeAgoString(from date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        
        if interval < 60 {
            return String(localized: "Just now")
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return String(localized: "\(minutes)m ago")
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return String(localized: "\(hours)h ago")
        } else {
            let days = Int(interval / 86400)
            return String(localized: "\(days)d ago")
        }
    }
}

struct ColorFormatRow: View {
    let format: ColorFormat
    let color: PickedColor
    @State private var isHovered: Bool = false
    
    var body: some View {
        HStack(spacing: 8) {
            Text(format.name)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 40, alignment: .leading)
            
            Text(format.value)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.primary)
                .lineLimit(1)
                .truncationMode(.middle)
            
            Spacer()
            
            if isHovered {
                Button(action: {
                    ColorPickerManager.shared.copyColorToClipboard(color, format: format)
                }) {
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 10))
                        .foregroundColor(.blue)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isHovered ? Color.white.opacity(0.1) : Color.clear)
        )
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.2)) {
                isHovered = hovering
            }
        }
        .onTapGesture {
            ColorPickerManager.shared.copyColorToClipboard(color, format: format)
        }
    }
}

#Preview {
    NotchColorPickerView()
        .frame(width: 500, height: 200)
        .background(Color.black)
        .onAppear {
            // Add some sample colors for preview
            let manager = ColorPickerManager.shared
            manager.colorHistory = PickedColor.sampleColors
        }
}
