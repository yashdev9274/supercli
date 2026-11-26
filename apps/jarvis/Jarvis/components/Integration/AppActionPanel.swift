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

import Foundation

/// A dedicated per-app compose/edit panel rendered in the integration notch
/// when the voice agent performed a write-style action (send an email, create
/// an issue, post a message, ...). Fields are pre-filled from the arguments the
/// agent already used, so the user can review, tweak and re-run the action.
struct AppActionPanel: Equatable {
    enum Kind: Equatable, Sendable {
        case gmailCompose
        case slackMessage
        case whatsappMessage
        case linearIssue
        case githubIssue
        case notionPage
        case calendarEvent
    }

    struct Field: Identifiable, Equatable {
        let key: String
        let label: String
        let value: String
        let multiline: Bool
        var id: String { key }
    }

    struct FieldSpec {
        let primaryKey: String
        let label: String
        let candidates: [String]
        let multiline: Bool
    }

    let kind: Kind
    let actionSlug: String
    let toolkitSlug: String
    let submitLabel: String
    let fields: [Field]

    /// Identifies the panel so the view can reset its local edit state when a
    /// new tool call replaces the panel.
    var stableID: String {
        actionSlug + fields.map(\.key).joined()
    }

    /// The action slug executed when the user confirms via the panel. Draft
    /// variants map to their send/finalize counterpart so "Send" really sends
    /// (the agent drafts via create_draft, then the user confirms the send).
    /// Handles both case styles and `*_EMAIL_DRAFT` variants:
    /// `gmail_create_draft` / `GMAIL_CREATE_EMAIL_DRAFT` → `*_SEND_EMAIL`.
    var submitSlug: String {
        let lower = actionSlug.lowercased()
        guard lower.contains("draft") else { return actionSlug }
        if let regex = try? NSRegularExpression(
            pattern: "(create|update)_(?:email_)?draft",
            options: [.caseInsensitive]
        ) {
            let range = NSRange(actionSlug.startIndex..., in: actionSlug)
            if let match = regex.firstMatch(in: actionSlug, range: range) {
                let matched = (actionSlug as NSString).substring(with: match.range)
                let replacement = matched == matched.uppercased() ? "SEND_EMAIL" : "send_email"
                return (actionSlug as NSString).replacingCharacters(in: match.range, with: replacement)
            }
        }
        return (actionSlug as NSString).replacingOccurrences(
            of: "(?i)(_draft)$",
            with: "_send_email",
            options: .regularExpression,
            range: NSRange(location: 0, length: (actionSlug as NSString).length)
        )
    }
}

extension AppActionPanel {
    /// Builds a compose panel from the first write-style tool call in the
    /// batch, or `nil` when the agent only read data (search/fetch/get).
    static func make(from toolCalls: [VoiceToolCall]) -> AppActionPanel? {
        guard let call = toolCalls.first(where: { kind(for: $0) != nil }) else { return nil }
        guard let kind = kind(for: call) else { return nil }
        let args = call.arguments ?? [:]
        let fields: [Field] = kind.fieldSpecs.map { spec in
            let matchedKey = spec.candidates.first { args[$0] != nil }
            let value = matchedKey.flatMap { args[$0]?.displayString } ?? ""
            return Field(key: matchedKey ?? spec.primaryKey, label: spec.label, value: value, multiline: spec.multiline)
        }
        return AppActionPanel(
            kind: kind,
            actionSlug: call.slug,
            toolkitSlug: call.toolkit ?? "",
            submitLabel: kind.submitLabel,
            fields: fields
        )
    }

    /// Maps a tool call to the panel kind that best matches its app + action.
    private static func kind(for call: VoiceToolCall) -> Kind? {
        let toolkit = (call.toolkit ?? "").lowercased()
        let slug = call.slug.lowercased()
        let t = { (needle: String) in toolkit.contains(needle) }
        let s = { (needle: String) in slug.contains(needle) }

        if t("gmail"), s("send_email") || s("create_email") || s("create_draft") || s("reply_to_email") || s("send_mail") || s("update_draft") {
            return .gmailCompose
        }
        if (t("calendar") || t("googlecalendar")), s("create_event") || s("update_event") {
            return .calendarEvent
        }
        if t("slack"), s("send_message") || s("post_message") || s("send_dm") {
            return .slackMessage
        }
        if t("whatsapp"), s("send_message") {
            return .whatsappMessage
        }
        if t("linear"), s("create_issue") || s("update_issue") || s("create_project") {
            return .linearIssue
        }
        if t("github"), s("create_issue") || s("update_issue") || s("create_pull_request") || s("update_pull_request") || s("create_repo") {
            return .githubIssue
        }
        if t("notion"), s("create_page") || s("update_page") {
            return .notionPage
        }
        return nil
    }
}

extension AppActionPanel.Kind {
    var title: String {
        switch self {
        case .gmailCompose: return "Compose Email"
        case .slackMessage, .whatsappMessage: return "Send Message"
        case .linearIssue, .githubIssue: return "Create Issue"
        case .notionPage: return "Create Page"
        case .calendarEvent: return "Create Event"
        }
    }

    var submitLabel: String {
        switch self {
        case .gmailCompose: return "Send Email"
        case .slackMessage, .whatsappMessage: return "Send Message"
        case .linearIssue, .githubIssue: return "Create Issue"
        case .notionPage: return "Create Page"
        case .calendarEvent: return "Create Event"
        }
    }

    var symbol: String {
        switch self {
        case .gmailCompose: return "envelope.fill"
        case .slackMessage: return "bubble.left.and.bubble.right.fill"
        case .whatsappMessage: return "phone.fill"
        case .linearIssue: return "chart.line.uptrend.xyaxis"
        case .githubIssue: return "chevron.left.forwardslash.chevron.right"
        case .notionPage: return "doc.text.fill"
        case .calendarEvent: return "calendar"
        }
    }

    /// Semantic fields for this panel kind. Each field maps to whichever of
    /// its candidate argument keys the agent actually used.
    var fieldSpecs: [AppActionPanel.FieldSpec] {
        switch self {
        case .gmailCompose:
            return [
                AppActionPanel.FieldSpec(primaryKey: "recipient_email", label: "To", candidates: ["recipient_email", "to", "recipient", "email_addresses", "email", "send_to"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "subject", label: "Subject", candidates: ["subject"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "body", label: "Message", candidates: ["body", "content", "message", "html_body"], multiline: true),
            ]
        case .slackMessage:
            return [
                AppActionPanel.FieldSpec(primaryKey: "channel", label: "Channel", candidates: ["channel", "channel_id", "conversation_id", "recipient"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "message", label: "Message", candidates: ["message", "text", "content", "body"], multiline: true),
            ]
        case .whatsappMessage:
            return [
                AppActionPanel.FieldSpec(primaryKey: "to", label: "To", candidates: ["to", "recipient", "phone_number", "contact"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "message", label: "Message", candidates: ["message", "text", "content", "body"], multiline: true),
            ]
        case .linearIssue:
            return [
                AppActionPanel.FieldSpec(primaryKey: "title", label: "Title", candidates: ["title", "name"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "description", label: "Description", candidates: ["description", "body", "content"], multiline: true),
            ]
        case .githubIssue:
            return [
                AppActionPanel.FieldSpec(primaryKey: "owner", label: "Owner", candidates: ["owner", "repo_owner", "org"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "repo", label: "Repository", candidates: ["repo", "repository", "repo_name"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "title", label: "Title", candidates: ["title", "name"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "body", label: "Body", candidates: ["body", "description", "content"], multiline: true),
            ]
        case .notionPage:
            return [
                AppActionPanel.FieldSpec(primaryKey: "title", label: "Title", candidates: ["title", "name", "page_title"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "content", label: "Content", candidates: ["content", "body", "markdown", "children"], multiline: true),
            ]
        case .calendarEvent:
            return [
                AppActionPanel.FieldSpec(primaryKey: "event_title", label: "Title", candidates: ["event_title", "title", "summary", "name"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "start_date_time", label: "Start", candidates: ["start_date_time", "start_time", "start", "start_date"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "end_date_time", label: "End", candidates: ["end_date_time", "end_time", "end", "end_date"], multiline: false),
                AppActionPanel.FieldSpec(primaryKey: "description", label: "Description", candidates: ["description", "body", "content", "notes"], multiline: true),
            ]
        }
    }
}
