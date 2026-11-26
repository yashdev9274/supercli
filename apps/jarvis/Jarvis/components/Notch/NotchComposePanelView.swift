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

/// Per-app compose/edit form rendered in the integration notch when the voice
/// agent performed a write-style action (send an email, create an issue, ...).
/// Fields are pre-filled from the agent's arguments; the user can tweak them
/// and re-run the action against the connected account.
@MainActor
struct NotchComposePanelView: View {
    @ObservedObject private var panel = IntegrationPanelManager.shared

    let compose: AppActionPanel

    @State private var fieldValues: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 8) {
                    ForEach(compose.fields) { field in
                        fieldView(for: field)
                    }
                }
            }
            submitButton
        }
        .onAppear {
            resetFields()
        }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: compose.kind.symbol)
                .font(.system(size: 12))
                .foregroundStyle(.cyan)
            Text(compose.kind.title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
            Text("Edit & run")
                .font(.system(size: 9))
                .foregroundStyle(.white.opacity(0.35))
        }
    }

    @ViewBuilder
    private func fieldView(for field: AppActionPanel.Field) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(field.label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(.white.opacity(0.5))
            if field.multiline {
                TextEditor(text: binding(for: field))
                    .font(.system(size: 11))
                    .foregroundStyle(.white)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .frame(height: 64)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color.white.opacity(0.08))
                    )
            } else {
                TextField(field.label, text: binding(for: field))
                    .textFieldStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(Color.white.opacity(0.08))
                    )
            }
        }
    }

    private var submitButton: some View {
        Button(action: submit) {
            HStack(spacing: 8) {
                if panel.isExecutingAction {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Image(systemName: "paperplane.fill")
                        .font(.system(size: 10))
                }
                Text(compose.submitLabel)
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.cyan.opacity(0.9))
            )
        }
        .buttonStyle(.plain)
        .disabled(panel.isExecutingAction || !canSubmit)
    }

    private var canSubmit: Bool {
        guard let first = compose.fields.first else { return false }
        let value = fieldValues[first.key]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return !value.isEmpty
    }

    private func submit() {
        var args: [String: ComposioJSONValue] = [:]
        for field in compose.fields {
            let value = (fieldValues[field.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { continue }
            args[field.key] = .string(value)
        }
        Task {
            await panel.runTool(compose.submitSlug, arguments: args)
        }
    }

    private func binding(for field: AppActionPanel.Field) -> Binding<String> {
        Binding(
            get: { fieldValues[field.key] ?? "" },
            set: { fieldValues[field.key] = $0 }
        )
    }

    private func resetFields() {
        fieldValues = compose.fields.reduce(into: [:]) { $0[$1.key] = $1.value }
    }
}