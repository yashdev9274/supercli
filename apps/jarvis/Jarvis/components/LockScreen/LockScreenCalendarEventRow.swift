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

struct LockScreenCalendarEventRow: View {
    let line: String
    let isVisible: Bool
    let renderToken: Int
    let font: Font
    let alignment: Alignment
    let iconName: String
    let iconRenderingMode: SymbolRenderingMode
    let iconColors: [Color]

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            calendarIcon
                .frame(width: 26, height: 26)

            Text(line)
                .font(font)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.85)
                .allowsTightening(true)
                .layoutPriority(10)
        }
        .frame(maxWidth: .infinity, alignment: alignment)
        .padding(.horizontal, 2)
        .id(renderToken)
        .opacity(isVisible ? 1 : 0)
        .accessibilityHidden(!isVisible)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var calendarIcon: some View {
        let baseImage = Image(systemName: iconName)
            .font(.system(size: 20, weight: .semibold))
            .id(iconRenderingModeIdentifier)

        if iconRenderingModeIdentifier.lowercased().contains("palette"), iconColors.count >= 2 {
            baseImage
                .symbolRenderingMode(.palette)
                .foregroundStyle(iconColors[0], iconColors[1])
        } else if iconColors.count >= 2 {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
                .foregroundStyle(iconColors[0], iconColors[1])
        } else if iconColors.count == 1 {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
                .foregroundStyle(iconColors[0])
        } else {
            baseImage
                .symbolRenderingMode(iconRenderingMode)
        }
    }

    private var iconRenderingModeIdentifier: String {
        String(describing: iconRenderingMode)
    }
}
