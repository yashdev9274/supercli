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

import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct DropItemView: View {
    let item: TrayDrop.DropItem
    @EnvironmentObject var vm: JarvisViewModel
    @ObservedObject var coordinator = JarvisCoordinator.shared
    @ObservedObject var tvm = TrayDrop.shared

    @State var hover = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(.clear)
                    .background {
                        Image(nsImage: item.workspacePreviewImage)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                
                Text(item.fileName)
                    .multilineTextAlignment(.center)
                    .font(.footnote)
                    .foregroundStyle(hover ? .white : .gray)
                    .lineLimit(2)
                    .allowsTightening(true)
            }
            .contentShape(Rectangle())
            .onDrag {
                handleOnDrag(for: item)
            }
            .frame(width: 64, height: 64)
            
            if hover {
                Circle()
                    .fill(.white)
                    .overlay(Image(systemName: "xmark").foregroundStyle(.black).font(.system(size: 7)).fontWeight(.semibold))
                    .frame(width: spacing, height: spacing)
                    .opacity(hover ? 1 : 0) // TODO: Use option key pressed to show delete
                    .scaleEffect(coordinator.optionKeyPressed ? 1 : 0.5)
                    .transition(.blurReplace.combined(with: .scale))
                    .offset(x: spacing / 2, y: -spacing / 2)
                    .onTapGesture { tvm.delete(item.id) }
                    .shadow(color: .black, radius: 3)
            }
        }
        .onHover { hovering in
            withAnimation(.smooth) {
                if hovering {
                    hover.toggle()
                } else {
                    hover.toggle()
                }
            }
        }
    }

    private func handleOnDrag(for item: TrayDrop.DropItem) -> NSItemProvider {
        guard let itemProvider = NSItemProvider(contentsOf: item.storageURL) else {
            return NSItemProvider()
        }
        
        let nameWithoutExtension = (item.fileName as NSString).deletingPathExtension
        itemProvider.suggestedName = nameWithoutExtension
        
        return itemProvider
    }
}
