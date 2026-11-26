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

/// Compact stand-in for the Integrations tab in the Dynamic Island.
/// Integration management now lives in the Settings window; this view
/// just points the user there.
@MainActor
struct NotchIntegrationRedirectView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "link")
                .font(.system(size: 24, weight: .light))
                .foregroundStyle(.white.opacity(0.8))

            Text("Manage integrations in Settings")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)

            Text("Connect apps and manage connections there.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.55))

            Button {
                SettingsWindowController.shared.showWindow()
            } label: {
                Text("Open Settings")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 7)
                    .background(Capsule().fill(Color.white.opacity(0.16)))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }
}

#Preview {
    NotchIntegrationRedirectView()
        .frame(width: 420, height: 200)
        .background(.black)
}