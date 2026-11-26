/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
 *
 * Originally from boring.notch project
 * Modified and adapted for Atoll (DynamicIsland)
 * See NOTICE for details.
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

extension View {
    func actionBar<Content: View>(padding: CGFloat = 10, @ViewBuilder content: () -> Content) -> some View {
        self
            .padding(.bottom, 24)
            .overlay(alignment: .bottom) {
                VStack(spacing: -1) {
                    Divider()
                    HStack(spacing: 0) {
                        content()
                            .buttonStyle(PlainButtonStyle())
                    }
                    .frame(height: 16)
                    .padding(.vertical, 4)
                    .padding(.horizontal, padding)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: 24)
                .background(.separator)
            }
    }
}
