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

struct ClipboardHistoryPopover: View {
    @ObservedObject var clipboardManager = ClipboardManager.shared
    @Binding var isPresented: Bool
    @EnvironmentObject var vm: JarvisViewModel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Image(systemName: "doc.on.clipboard")
                    .foregroundColor(.white)
                    .font(.system(size: 16, weight: .medium))
                Text("Clipboard History")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white)
                
                Spacer()
                
                Button(action: {
                    clipboardManager.clearHistory()
                }) {
                    Image(systemName: "trash")
                        .foregroundColor(.red)
                        .font(.system(size: 12))
                }
                .buttonStyle(PlainButtonStyle())
                .disabled(clipboardManager.clipboardHistory.isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            
            Divider()
                .background(Color.gray.opacity(0.3))
            
            // Content
            if clipboardManager.clipboardHistory.isEmpty {
                EmptyClipboardView()
            } else {
                ClipboardItemsList()
            }
        }
        .frame(width: 280)
        .frame(maxHeight: 200)
        .background(Color.black.opacity(0.95))
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.gray.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 5)
        .onHover { hovering in
            // Close popover and notch when mouse exits
            if !hovering {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    isPresented = false
                    // Also close the notch if no other popovers are active
                    if vm.notchState == .open && !vm.isBatteryPopoverActive {
                        vm.close()
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func EmptyClipboardView() -> some View {
        VStack(spacing: 8) {
            Image(systemName: "clipboard")
                .font(.system(size: 24))
                .foregroundColor(.gray)
            Text("No clipboard history")
                .font(.system(size: 12))
                .foregroundColor(.gray)
            Text("Copy something to get started")
                .font(.system(size: 10))
                .foregroundColor(.gray.opacity(0.7))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 20)
    }
    
    @ViewBuilder
    private func ClipboardItemsList() -> some View {
        ScrollView {
            LazyVStack(spacing: 1) {
                ForEach(clipboardManager.clipboardHistory) { item in
                    ClipboardItemRow(item: item) {
                        isPresented = false
                    }
                }
            }
        }
        .frame(maxHeight: 150)
    }
}

struct ClipboardItemRow: View {
    let item: ClipboardItem
    let onCopy: () -> Void
    @ObservedObject var clipboardManager = ClipboardManager.shared
    @State private var isHovering = false
    
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            // Type icon
            Image(systemName: item.type.icon)
                .font(.system(size: 12))
                .foregroundColor(.blue)
                .frame(width: 16)
            
            // Content
            VStack(alignment: .leading, spacing: 2) {
                Text(item.preview)
                    .font(.system(size: 11))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                
                HStack {
                    Text(item.type.displayName)
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                    
                    Spacer()
                    
                    Text(timeAgoString(from: item.timestamp))
                        .font(.system(size: 9))
                        .foregroundColor(.gray)
                }
            }
            
            Spacer()
            
            // Action buttons (shown on hover)
            if isHovering {
                HStack(spacing: 4) {
                    Button(action: {
                        clipboardManager.copyToClipboard(item)
                        onCopy()
                    }) {
                        Image(systemName: "doc.on.doc")
                            .font(.system(size: 10))
                            .foregroundColor(.green)
                    }
                    .buttonStyle(PlainButtonStyle())
                    
                    Button(action: {
                        clipboardManager.deleteItem(item)
                    }) {
                        Image(systemName: "trash")
                            .font(.system(size: 10))
                            .foregroundColor(.red)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isHovering ? Color.white.opacity(0.1) : Color.clear)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: 0.2)) {
                isHovering = hovering
            }
        }
        .onTapGesture {
            clipboardManager.copyToClipboard(item)
            onCopy()
        }
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

#Preview {
    ClipboardHistoryPopover(isPresented: .constant(true))
        .padding()
        .background(Color.gray)
}
