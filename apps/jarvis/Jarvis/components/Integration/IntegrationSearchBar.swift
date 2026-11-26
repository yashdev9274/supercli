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

enum IntegrationFilter: String, CaseIterable, Identifiable {
    case all = "All Integrations"
    case active = "Active"

    var id: String { rawValue }
}

struct IntegrationSearchBar: View {
    @Binding var searchText: String
    @Binding var filter: IntegrationFilter

    var body: some View {
        VStack(spacing: 10) {
            searchField

            HStack(spacing: 8) {
                ForEach(IntegrationFilter.allCases) { option in
                    filterButton(option)
                }
                Spacer()
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.55))

            TextField("Search integrations", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(.white)

            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(.white.opacity(0.45))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.white.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func filterButton(_ option: IntegrationFilter) -> some View {
        let isSelected = filter == option
        return Button {
            withAnimation(.smooth(duration: 0.2)) {
                filter = option
            }
        } label: {
            Text(option.rawValue)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isSelected ? .white : .white.opacity(0.6))
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(isSelected ? Color.white.opacity(0.16) : Color.clear)
                )
                .overlay(
                    Capsule()
                        .stroke(isSelected ? Color.white.opacity(0.12) : Color.white.opacity(0.06), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    IntegrationSearchBar(searchText: .constant(""), filter: .constant(.all))
        .frame(width: 400)
        .padding(16)
        .background(.black)
}
