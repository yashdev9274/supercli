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

/// Standalone inline HUD shown in the closed Dynamic Island when the
/// File Tray (Shelf) has items and no higher-priority live activity is active.
///
/// Layout mirrors the battery inline HUD:
///   [tray icon] ─── [ notch ] ─── [bold green count]
struct ShelfInlineLiveActivity: View {
    @EnvironmentObject var vm: JarvisViewModel
    @ObservedObject private var shelfState = ShelfStateViewModel.shared

    private let sideWidth: CGFloat = 24

    var body: some View {
        HStack(spacing: 0) {

            // LEFT of notch — tray icon (white, same style as the screenshot)
            Image(systemName: "tray.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .frame(width: sideWidth, alignment: .leading)

            // Physical notch / pill space
            Rectangle()
                .fill(Color.black)
                .frame(width: vm.closedNotchSize.width)

            // RIGHT of notch — file count in white
            Text("\(shelfState.items.count)")
                .font(.system(.callout, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
                .contentTransition(.numericText(countsDown: false))
                .animation(.smooth(duration: 0.3), value: shelfState.items.count)
                .frame(width: sideWidth, alignment: .trailing)
        }
        .frame(height: vm.effectiveClosedNotchHeight, alignment: .center)
    }
}
