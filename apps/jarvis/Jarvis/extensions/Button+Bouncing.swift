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
import Defaults

struct BouncingButtonStyle: ButtonStyle {
    let vm: JarvisViewModel
    @State private var isPressed = false
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: Defaults[.cornerRadiusScaling] ? 10 : MusicPlayerImageSizes.cornerRadiusInset.closed)
                    .fill(Color(red: 20/255, green: 20/255, blue: 20/255))
                    .strokeBorder(.white.opacity(0.04), lineWidth: 1)
            )
            .scaleEffect(isPressed ? 0.9 : 1.0)
            .onChange(of: configuration.isPressed) { _, _ in
                withAnimation(.spring(response: 0.3, dampingFraction: 0.3, blendDuration: 0.3)) {
                    isPressed.toggle()
                }
            }
    }
}

extension Button {
    func bouncingStyle(vm: JarvisViewModel) -> some View {
        self.buttonStyle(BouncingButtonStyle(vm: vm))
    }
}
