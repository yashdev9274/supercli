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

/// A pill-shaped (capsule-like) clip shape used for the Dynamic Island mode
/// on external and non-notched displays. Uses `.continuous` rounded corners
/// for an Apple-style squircle appearance, inspired by JarvisKit's
/// floating style.
struct JarvisPillShape: Shape {
    var cornerRadius: CGFloat

    var animatableData: CGFloat {
        get { cornerRadius }
        set { cornerRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let resolvedRadius = min(cornerRadius, min(rect.width, rect.height) / 2)
        return Path(roundedRect: rect, cornerRadius: resolvedRadius, style: .continuous)
    }
}

#Preview {
    VStack(spacing: 20) {
        JarvisPillShape(cornerRadius: 16)
            .fill(.black)
            .frame(width: 185, height: 32)

        JarvisPillShape(cornerRadius: 24)
            .fill(.black)
            .frame(width: 640, height: 200)
    }
    .padding(20)
}
