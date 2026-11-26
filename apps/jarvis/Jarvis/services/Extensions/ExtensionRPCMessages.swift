/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
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

// MARK: - JSON-RPC 2.0 Message Types

/// Incoming JSON-RPC 2.0 request from a client.
struct RPCRequest: Codable {
    let jsonrpc: String
    let method: String
    let params: RPCParams?
    let id: String
}

/// Outgoing JSON-RPC 2.0 success response.
struct RPCSuccessResponse: Codable {
    let jsonrpc: String
    let result: [String: RPCValue]
    let id: String

    init(result: [String: RPCValue], id: String) {
        self.jsonrpc = "2.0"
        self.result = result
        self.id = id
    }
}

/// Outgoing JSON-RPC 2.0 error response.
struct RPCErrorResponse: Codable {
    let jsonrpc: String
    let error: RPCErrorObject
    let id: String?

    init(error: RPCErrorObject, id: String?) {
        self.jsonrpc = "2.0"
        self.error = error
        self.id = id
    }
}

/// JSON-RPC error object.
struct RPCErrorObject: Codable {
    let code: Int
    let message: String
    let data: String?

    init(code: Int, message: String, data: String? = nil) {
        self.code = code
        self.message = message
        self.data = data
    }
}

/// Outgoing JSON-RPC 2.0 notification (server → client, no id).
struct RPCNotification: Codable {
    let jsonrpc: String
    let method: String
    let params: [String: RPCValue]

    init(method: String, params: [String: RPCValue]) {
        self.jsonrpc = "2.0"
        self.method = method
        self.params = params
    }
}

// MARK: - Standard Error Codes

enum RPCErrorCode {
    static let parseError      = -32700
    static let invalidRequest  = -32600
    static let methodNotFound  = -32601
    static let invalidParams   = -32602
    static let internalError   = -32603
    // Application-specific codes
    static let unauthorized    = -32001
    static let featureDisabled = -32002
    static let capacityExceeded = -32003
    static let descriptorInvalid = -32004
    static let unsupported     = -32005
}

// MARK: - Flexible JSON Value

/// Type-erased JSON value for RPC params and results.
enum RPCValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
    case object([String: RPCValue])
    case array([RPCValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let b = try? container.decode(Bool.self) {
            self = .bool(b)
        } else if let i = try? container.decode(Int.self) {
            self = .int(i)
        } else if let d = try? container.decode(Double.self) {
            self = .double(d)
        } else if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let obj = try? container.decode([String: RPCValue].self) {
            self = .object(obj)
        } else if let arr = try? container.decode([RPCValue].self) {
            self = .array(arr)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .int(let i):    try container.encode(i)
        case .double(let d): try container.encode(d)
        case .bool(let b):   try container.encode(b)
        case .null:          try container.encodeNil()
        case .object(let o): try container.encode(o)
        case .array(let a):  try container.encode(a)
        }
    }

    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }
    var boolValue: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }
    var objectValue: [String: RPCValue]? {
        if case .object(let o) = self { return o }
        return nil
    }
}

// MARK: - Flexible Params

/// JSON-RPC params can be an object or individual values.
struct RPCParams: Codable {
    let values: [String: RPCValue]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.values = try container.decode([String: RPCValue].self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }

    subscript(key: String) -> RPCValue? {
        values[key]
    }

    /// Extract a JSON sub-object as raw Data for use with JSONDecoder.
    func jsonData(for key: String) -> Data? {
        guard let value = values[key] else { return nil }
        return try? JSONEncoder().encode(value)
    }
}
