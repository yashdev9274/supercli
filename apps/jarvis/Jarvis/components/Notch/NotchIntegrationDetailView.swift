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

/// Integration panel inside the Dynamic Island.
///
/// Shown when a voice call invokes an app (e.g. "check my email"): renders the
/// app being called, what the agent did, and the toolkit's actions so the user
/// can run them client-side via Composio. With no active app it falls back to
/// the list of connected apps.
@MainActor
struct NotchIntegrationDetailView: View {
    @ObservedObject private var panel = IntegrationPanelManager.shared
    @ObservedObject private var composio = ComposioManager.shared

    var body: some View {
        Group {
            if let app = panel.activeApp {
                detailContent(for: app)
            } else {
                appsList
            }
        }
        .frame(width: 320)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Single app detail

    private func detailContent(for app: IntegrationPanelManager.ActiveApp) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            header(for: app)
            activitySection
            Divider()
                .overlay(Color.white.opacity(0.12))
            if let compose = panel.composePanel {
                NotchComposePanelView(compose: compose)
                    .id(compose.stableID)
            } else {
                if !panel.toolCalls.isEmpty {
                    toolCallChips
                }
                actionsSection
            }
            if let error = panel.actionError {
                statusLine(icon: "exclamationmark.triangle.fill", color: .red, text: error)
            } else if let result = panel.actionResult {
                statusLine(icon: "checkmark.circle.fill", color: .green, text: result)
            }
        }
    }

    private func header(for app: IntegrationPanelManager.ActiveApp) -> some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.14))
                .frame(width: 36, height: 36)
                .overlay(
                    Image(systemName: app.symbol)
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(app.appName)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                HStack(spacing: 4) {
                    Circle()
                        .fill(isConnected(to: app) ? Color.green : Color.gray.opacity(0.6))
                        .frame(width: 6, height: 6)
                    Text(isConnected(to: app) ? "Connected" : "Not connected")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }

            Spacer()

            Button {
                panel.clear()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(Color.white.opacity(0.1)))
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var activitySection: some View {
        switch panel.activity {
        case .idle:
            EmptyView()
        case .working(let text):
            activityRow(icon: "ellipsis", color: .cyan, text: text, spinning: true)
        case .success(let text):
            activityRow(icon: "checkmark.circle.fill", color: .green, text: text, spinning: false)
        case .failure(let text):
            activityRow(icon: "xmark.circle.fill", color: .red, text: text, spinning: false)
        }
    }

    private func activityRow(icon: String, color: Color, text: String, spinning: Bool) -> some View {
        HStack(spacing: 8) {
            if spinning {
                ProgressView()
                    .controlSize(.small)
                    .tint(color)
            } else {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundStyle(color)
            }
            Text(text)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.75))
                .lineLimit(2)
        }
    }

    private var toolCallChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(panel.toolCalls, id: \.self) { call in
                    HStack(spacing: 5) {
                        Circle()
                            .fill(call.isSuccess ? Color.green : Color.red)
                            .frame(width: 5, height: 5)
                        Text(call.summary ?? call.slug)
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.8))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
                }
            }
        }
    }

    // MARK: - Actions

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Quick Actions")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white.opacity(0.5))

            if panel.isLoadingActions {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Loading actions…")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.5))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else if panel.actions.isEmpty {
                Text(panel.actionError != nil ? "Actions unavailable" : "No actions available")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.4))
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 6) {
                        ForEach(panel.actions) { action in
                            ActionRowView(
                                action: action,
                                isRunning: panel.isExecutingAction && panel.pendingAction?.slug == action.slug,
                                isExpanded: expandedAction == action.slug,
                                onTap: { toggleAction(action) },
                                onRun: { run(action, arguments: $0) }
                            )
                        }
                    }
                }
                .frame(maxHeight: 150)
            }
        }
    }

    // MARK: - Apps list fallback

    private var appsList: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Integrations")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Button {
                    panel.clear()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(width: 22, height: 22)
                        .background(Circle().fill(Color.white.opacity(0.1)))
                }
                .buttonStyle(.plain)
            }

            let accounts = connectedAccounts
            if accounts.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "link")
                        .font(.system(size: 22, weight: .light))
                        .foregroundStyle(.white.opacity(0.6))
                    Text("No apps connected yet")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white)
                    Text("Ask Jarvis to check your email, open GitHub, and more.")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            } else {
                VStack(spacing: 4) {
                    ForEach(accounts, id: \.id) { account in
                        connectedAppRow(for: account)
                    }
                }
            }

            Button {
                SettingsWindowController.shared.showWindow()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "gear")
                        .font(.system(size: 11))
                    Text("Manage in Settings")
                        .font(.system(size: 11, weight: .medium))
                }
                .foregroundStyle(.white.opacity(0.7))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func connectedAppRow(for account: ComposioConnectedAccount) -> some View {
        let slug = account.toolkit?.slug ?? ""
        let info = IntegrationPanelManager.appInfo(forToolkit: slug, appName: account.toolkit?.name)
        return Button {
            panel.presentApp(toolkitSlug: slug, appName: info.name, symbol: info.symbol)
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(Color.white.opacity(0.12))
                    .frame(width: 28, height: 28)
                    .overlay(
                        Image(systemName: info.symbol)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white)
                    )
                Text(info.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.4))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.white.opacity(0.04))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private var connectedAccounts: [ComposioConnectedAccount] {
        composio.connectedAccounts.filter { $0.status?.isActive ?? false }
    }

    private func isConnected(to app: IntegrationPanelManager.ActiveApp) -> Bool {
        !app.toolkitSlug.isEmpty && composio.connectedAccount(for: app.toolkitSlug) != nil
    }

    private func statusLine(icon: String, color: Color, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundStyle(color)
            Text(text)
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func toggleAction(_ action: ComposioToolAction) {
        if expandedAction == action.slug {
            expandedAction = nil
        } else if action.hasRequiredInput {
            expandedAction = action.slug
        } else {
            run(action, arguments: [:])
        }
    }

    private func run(_ action: ComposioToolAction, arguments: [String: ComposioJSONValue]) {
        Task {
            await panel.run(action, arguments: arguments)
            expandedAction = nil
        }
    }

    // MARK: - Action form state

    @State private var expandedAction: String?

    private struct ActionRowView: View {
        let action: ComposioToolAction
        let isRunning: Bool
        let isExpanded: Bool
        let onTap: () -> Void
        let onRun: ([String: ComposioJSONValue]) -> Void

        @State private var formValues: [String: String] = [:]
        @State private var formBools: [String: Bool] = [:]

        var body: some View {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    if isRunning {
                        ProgressView()
                            .controlSize(.small)
                            .tint(.cyan)
                    } else {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.cyan)
                            .frame(width: 16)
                    }
                    Text(action.displayName)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                        .lineLimit(1)
                    Spacer()
                    if action.hasRequiredInput {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.4))
                    } else {
                        Button(action: { onRun([:]) }) {
                            Text("Run")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(Capsule().fill(Color.cyan.opacity(0.25)))
                        }
                        .buttonStyle(.plain)
                        .disabled(isRunning)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
                .onTapGesture(perform: onTap)

                if isExpanded, let schema = action.inputParameters {
                    ActionFormView(
                        schema: schema,
                        formValues: $formValues,
                        formBools: $formBools,
                        onSubmit: { onRun($0) }
                    )
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.white.opacity(isExpanded ? 0.1 : 0.05))
            )
        }
    }

    private struct ActionFormView: View {
        let schema: ComposioToolInputSchema
        @Binding var formValues: [String: String]
        @Binding var formBools: [String: Bool]
        let onSubmit: ([String: ComposioJSONValue]) -> Void

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(schema.requiredInputKeys, id: \.self) { key in
                    field(for: key, property: schema.properties?[key])
                }
                Button(action: submit) {
                    Text("Execute")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(
                            RoundedRectangle(cornerRadius: 7, style: .continuous)
                                .fill(Color.cyan.opacity(0.3))
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)
        }

        private func submit() {
            var args: [String: ComposioJSONValue] = [:]
            for key in schema.requiredInputKeys {
                guard let property = schema.properties?[key] else { continue }
                if property.type == "boolean" {
                    args[key] = .bool(formBools[key] ?? false)
                } else if let value = formValues[key], !value.isEmpty {
                    if property.type == "integer", let int = Int(value) {
                        args[key] = .number(Double(int))
                    } else if property.type == "number", let double = Double(value) {
                        args[key] = .number(double)
                    } else {
                        args[key] = .string(value)
                    }
                } else if let defaultValue = property.defaultValue {
                    args[key] = defaultValue
                }
            }
            onSubmit(args)
        }

        @ViewBuilder
        private func field(for key: String, property: ComposioToolInputProperty?) -> some View {
            let title = property?.title ?? key
            if let property, let options = property.enum, !options.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                    Menu {
                        ForEach(options, id: \.self) { option in
                            Button(option.displayString) {
                                formValues[key] = option.displayString
                            }
                        }
                    } label: {
                        HStack {
                            Text(formValues[key] ?? property.defaultValue?.displayString ?? "Select…")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.85))
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 9))
                                .foregroundStyle(.white.opacity(0.4))
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(Color.white.opacity(0.08))
                        )
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize(horizontal: false, vertical: true)
                }
            } else if property?.type == "boolean" {
                Toggle(title, isOn: Binding(
                    get: { formBools[key] ?? false },
                    set: { formBools[key] = $0 }
                ))
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.85))
                .toggleStyle(.switch)
                .controlSize(.mini)
            } else if let type = property?.type,
                      type == "array" || type == "object" {
                Text("\(title) (unsupported in notch)")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.4))
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.white.opacity(0.5))
                    TextField(property?.defaultValue?.displayString ?? "Enter \(title)…", text: Binding(
                        get: { formValues[key] ?? "" },
                        set: { formValues[key] = $0 }
                    ))
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
    }
}