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
import AppKit

class DragDropView: NSView {
    var onDragEntered: () -> Void = {}
    var onDragExited: () -> Void = {}
    var onDrop: () -> Void = {}
    
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        registerForDraggedTypes([.fileURL])
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        onDragEntered()
        return .copy
    }
    
    override func draggingExited(_ sender: NSDraggingInfo?) {
        onDragExited()
    }
    
    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        onDrop()
        return true
    }
}

struct DragDropViewRepresentable: NSViewRepresentable {
    @Binding var isTargeted: Bool
    var onDrop: () -> Void
    
    func makeNSView(context: Context) -> DragDropView {
        let view = DragDropView()
        view.onDragEntered = { isTargeted = true }
        view.onDragExited = { isTargeted = false }
        view.onDrop = onDrop
        
        view.autoresizingMask = [.width, .height]
        
        return view
    }
    
    func updateNSView(_ nsView: DragDropView, context: Context) {}
}
