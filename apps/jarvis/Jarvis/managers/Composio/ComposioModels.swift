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

// MARK: - Toolkit

struct ComposioToolkit: Codable, Identifiable, Hashable {
    let slug: String
    let name: String
    let noAuth: Bool?
    let authSchemes: [String]?
    let composioManagedAuthSchemes: [String]?
    let meta: ComposioToolkitMeta?

    enum CodingKeys: String, CodingKey {
        case slug
        case name
        case noAuth = "no_auth"
        case authSchemes = "auth_schemes"
        case composioManagedAuthSchemes = "composio_managed_auth_schemes"
        case meta
    }

    var id: String { slug }

    var description: String? { meta?.description }
    var logo: String? { meta?.logo }
    var categories: [String]? { meta?.categoryNames }
    var toolsCount: Int? { meta?.toolsCount }
    var canConnect: Bool { !(composioManagedAuthSchemes?.isEmpty ?? true) }
}

struct ComposioToolkitMeta: Codable, Hashable {
    let description: String?
    let logo: String?
    let toolsCount: Int?
    let categories: [ComposioToolkitCategory]?

    enum CodingKeys: String, CodingKey {
        case description
        case logo
        case toolsCount = "tools_count"
        case categories
    }

    var categoryNames: [String]? {
        categories?.compactMap(\.name)
    }
}

struct ComposioToolkitCategory: Codable, Hashable {
    let id: String?
    let name: String?
}

// MARK: - Auth config

struct ComposioAuthConfig: Codable, Identifiable, Hashable {
    let id: String
    let name: String?
    let toolkit: ComposioToolkitReference?
    let isComposioManaged: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case toolkit
        case isComposioManaged = "is_composio_managed"
    }
}

struct ComposioToolkitReference: Codable, Hashable {
    let slug: String
    let name: String?
    let logo: String?
}

// MARK: - Connected account

enum ComposioConnectionStatus: String, Codable {
    case initializing = "INITIALIZING"
    case initiated = "INITIATED"
    case active = "ACTIVE"
    case failed = "FAILED"
    case revoked = "REVOKED"
    case error = "ERROR"
    case unknown

    var isActive: Bool { self == .active }
}

struct ComposioConnectedAccount: Codable, Identifiable, Hashable {
    let id: String
    let alias: String?
    let toolkit: ComposioToolkitReference?
    let status: ComposioConnectionStatus?
    let createdAt: String?
    let isDisabled: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case alias
        case toolkit
        case status
        case createdAt = "created_at"
        case isDisabled = "is_disabled"
    }
}

// MARK: - Link session

struct ComposioLinkSession: Codable {
    let linkToken: String
    let redirectURL: String?

    enum CodingKeys: String, CodingKey {
        case linkToken = "link_token"
        case redirectURL = "redirect_url"
    }
}

// MARK: - List envelope

struct ComposioListEnvelope<T: Codable>: Codable {
    let items: [T]
    let totalItems: Int?
    let page: Int?
    let totalPages: Int?
    let cursor: String?

    enum CodingKeys: String, CodingKey {
        case items
        case totalItems = "total_items"
        case page = "current_page"
        case totalPages = "total_pages"
        case cursor = "next_cursor"
    }
}

// MARK: - Tool actions

/// A single tool/action exposed by a Composio toolkit (e.g. Gmail fetch emails,
/// GitHub create issue). `inputParameters` is a JSON Schema object.
struct ComposioToolAction: Codable, Identifiable, Hashable, Sendable {
    let slug: String
    let name: String?
    let description: String?
    let toolkit: ComposioToolkitReference?
    let inputParameters: ComposioToolInputSchema?
    let isDeprecated: Bool?
    let isDisabled: Bool?

    enum CodingKeys: String, CodingKey {
        case slug
        case name
        case description
        case toolkit
        case inputParameters = "input_parameters"
        case isDeprecated = "is_deprecated"
        case isDisabled = "is_disabled"
    }

    var id: String { slug }

    var displayName: String { name ?? slug }

    var requiredInputKeys: [String] { inputParameters?.required ?? [] }

    var hasRequiredInput: Bool { !requiredInputKeys.isEmpty }
}

struct ComposioToolInputSchema: Codable, Hashable, Sendable {
    let type: String?
    let properties: [String: ComposioToolInputProperty]?
    let required: [String]?
    let description: String?

    /// Required parameter keys that have a matching property definition.
    var requiredInputKeys: [String] {
        required ?? []
    }
}

struct ComposioToolInputProperty: Codable, Hashable, Sendable {
    let type: String?
    let title: String?
    let description: String?
    let format: String?
    let `enum`: [ComposioJSONValue]?
    let defaultValue: ComposioJSONValue?

    enum CodingKeys: String, CodingKey {
        case type
        case title
        case description
        case format
        case `enum`
        case defaultValue = "default"
    }
}

// MARK: - Tool execution

struct ComposioToolExecutionResponse: Codable, Hashable, Sendable {
    let data: ComposioJSONValue?
    let error: ComposioJSONValue?
    let successful: Bool?
}

/// Ergonomic JSON value used for tool arguments and execution results.
/// Keeps raw shapes (nested objects/arrays) intact while providing a readable
/// one-line representation for the Dynamic Island panel.
enum ComposioJSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([ComposioJSONValue])
    case object([String: ComposioJSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([ComposioJSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: ComposioJSONValue].self) {
            self = .object(value)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case .null: try container.encodeNil()
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }

    /// Compact one-line summary; nested objects/arrays are flattened with
    /// counts instead of dumping raw JSON.
    var displayString: String {
        switch self {
        case let .string(value):
            return value
        case let .number(value):
            return value == value.rounded() ? String(Int(value)) : String(value)
        case let .bool(value):
            return value ? "true" : "false"
        case .null:
            return "null"
        case let .array(values):
            let items = values.map(\.shortString)
            if items.isEmpty { return "[]" }
            return items.count > 3
                ? "\(items.prefix(3).joined(separator: ", ")), … (\(values.count) items)"
                : items.joined(separator: ", ")
        case let .object(values):
            if values.isEmpty { return "{}" }
            let entries = values.map { key, value in "\(key): \(value.shortString)" }
            return entries.count > 4
                ? "\(entries.prefix(4).joined(separator: ", ")), … (\(entries.count) keys)"
                : entries.joined(separator: ", ")
        }
    }

    private var shortString: String {
        switch self {
        case let .array(values): return "[\(values.count) items]"
        case let .object(values): return "{\(values.count) keys}"
        default: return displayString
        }
    }
}

// MARK: - Errors

enum ComposioAPIError: LocalizedError {
    case invalidURL
    case missingAPIKey
    case httpStatus(Int, String?)
    case decoding(String)
    case noAuthConfig(String)
    case linkSessionFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return String(localized: "Invalid request URL.")
        case .missingAPIKey:
            return String(localized: "Composio API key is not configured. Add it in Settings.")
        case let .httpStatus(code, body):
            if let body, !body.isEmpty {
                return String(localized: "Composio request failed (\(code)): \(body)")
            }
            return String(localized: "Composio request failed (\(code)).")
        case let .decoding(message):
            return String(localized: "Failed to decode Composio response: \(message)")
        case let .noAuthConfig(slug):
            return String(localized: "No authentication configuration found for \(slug).")
        case let .linkSessionFailed(message):
            return String(localized: "Failed to start connection session: \(message)")
        }
    }
}
