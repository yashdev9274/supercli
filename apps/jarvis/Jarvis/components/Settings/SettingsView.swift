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
import Sparkle

enum SettingsSection: String, CaseIterable, Identifiable {
    case integrations = "Integrations"
    case general = "General"
    case about = "About"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .integrations: return "link"
        case .general: return "gearshape"
        case .about: return "info.circle"
        }
    }
}

struct SettingsView: View {
    let updaterController: SPUStandardUpdaterController?

    @State private var selectedSection: SettingsSection = .integrations

    init(updaterController: SPUStandardUpdaterController? = nil) {
        self.updaterController = updaterController
    }

    var body: some View {
        NavigationSplitView {
            List(SettingsSection.allCases, selection: $selectedSection) { section in
                Label(section.rawValue, systemImage: section.icon)
                    .font(.system(size: 13))
                    .tag(section)
            }
            .listStyle(.sidebar)
            .navigationSplitViewColumnWidth(min: 170, ideal: 200)
        } detail: {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .preferredColorScheme(.dark)
    }

    @ViewBuilder
    private var content: some View {
        switch selectedSection {
        case .integrations:
            SettingsIntegrationsView()
                .padding(24)
        case .general:
            generalPane
        case .about:
            aboutPane
        }
    }

    private var generalPane: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("General")
                .font(.system(size: 18, weight: .bold))
            Text("General preferences are coming soon.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var aboutPane: some View {
        VStack(spacing: 10) {
            Image(systemName: "link.circle.fill")
                .font(.system(size: 44))
                .foregroundStyle(.secondary)

            Text("JARVIS")
                .font(.system(size: 18, weight: .bold))

            Text("Version \(appVersion)")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)

            Text("A Dynamic Island for your Mac, with AI integrations.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
}