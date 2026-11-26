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

struct IntegrationRowView: View {
    let toolkit: ComposioToolkit
    let isConnected: Bool
    let isBusy: Bool
    let onConnect: () -> Void
    let onDisconnect: () -> Void

    @State private var isHovering = false

    var body: some View {
        HStack(spacing: 12) {
            logo

            VStack(alignment: .leading, spacing: 3) {
                Text(toolkit.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if isConnected {
                    Label("Connected", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(Color(red: 0.29, green: 0.78, blue: 0.42))
                } else {
                    Text("Not connected")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.4))
                }

                if let description = toolkit.description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            actionButton
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isHovering ? Color.white.opacity(0.08) : Color.white.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.07), lineWidth: 1)
        )
        .onHover { hovering in
            withAnimation(.smooth(duration: 0.15)) {
                isHovering = hovering
            }
        }
    }

    @ViewBuilder
    private var logo: some View {
        if let logoURLString = toolkit.logo, let logoURL = URL(string: logoURLString) {
            AsyncImage(url: logoURL) { phase in
                switch phase {
                case let .success(image):
                    image
                        .resizable()
                        .scaledToFit()
                default:
                    placeholder
                }
            }
            .frame(width: 34, height: 34)
        } else {
            placeholder
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(Color.white.opacity(0.1))
            .frame(width: 34, height: 34)
            .overlay {
                Text(String(toolkit.name.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }
    }

    private var actionButton: some View {
        Button(action: {
            if isConnected {
                onDisconnect()
            } else {
                onConnect()
            }
        }) {
            Group {
                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 14, height: 14)
                } else if isConnected {
                    Text("Disconnect")
                } else {
                    Text("Connect")
                }
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(isConnected ? .white.opacity(0.85) : .white)
            .frame(minWidth: 82)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isConnected ? Color.white.opacity(0.12) : Color.white.opacity(0.2))
            )
            .overlay(
                Capsule()
                    .stroke(isConnected ? Color.white.opacity(0.1) : Color.white.opacity(0.14), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .help(isConnected ? "Disconnect \(toolkit.name)" : "Connect \(toolkit.name)")
    }
}

#Preview {
    VStack(spacing: 8) {
        IntegrationRowView(
            toolkit: ComposioToolkit(
                slug: "notion",
                name: "Notion",
                noAuth: false,
                authSchemes: ["OAUTH2"],
                composioManagedAuthSchemes: ["OAUTH2"],
                meta: ComposioToolkitMeta(
                    description: "Docs, notes, databases and wiki pages",
                    logo: nil,
                    toolsCount: 42,
                    categories: [ComposioToolkitCategory(id: "productivity", name: "productivity")]
                )
            ),
            isConnected: true,
            isBusy: false,
            onConnect: {},
            onDisconnect: {}
        )
        IntegrationRowView(
            toolkit: ComposioToolkit(
                slug: "github",
                name: "GitHub",
                noAuth: false,
                authSchemes: ["OAUTH2"],
                composioManagedAuthSchemes: ["OAUTH2"],
                meta: ComposioToolkitMeta(
                    description: "Repositories, issues, pull requests",
                    logo: nil,
                    toolsCount: 63,
                    categories: [ComposioToolkitCategory(id: "dev", name: "dev")]
                )
            ),
            isConnected: false,
            isBusy: false,
            onConnect: {},
            onDisconnect: {}
        )
    }
    .frame(width: 420)
    .padding(16)
    .background(.black)
}
