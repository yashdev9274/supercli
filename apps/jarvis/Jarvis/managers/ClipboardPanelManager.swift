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

import AppKit
import SwiftUI

class ClipboardPanelManager: ObservableObject {
    static let shared = ClipboardPanelManager()
    
    private var clipboardPanel: ClipboardPanel?
    
    private init() {}
    
    func showClipboardPanel() {
        hideClipboardPanel() // Close any existing panel
        
        let panel = ClipboardPanel()
        panel.positionNearNotch()
        
        self.clipboardPanel = panel
        
        // Make the panel key and order front to ensure it can receive focus
        panel.makeKeyAndOrderFront(nil)
        panel.orderFrontRegardless()
        
        // Activate the app to ensure proper focus handling
        NSApp.activate(ignoringOtherApps: true)
        
        // Ensure the panel becomes the key window for text input
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            panel.makeKey()
        }
    }
    
    func hideClipboardPanel() {
        clipboardPanel?.close()
        clipboardPanel = nil
    }
    
    func toggleClipboardPanel() {
        if let panel = clipboardPanel, panel.isVisible {
            hideClipboardPanel()
        } else {
            showClipboardPanel()
        }
    }
    
    var isPanelVisible: Bool {
        return clipboardPanel?.isVisible ?? false
    }
}
