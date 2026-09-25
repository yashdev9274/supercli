import Foundation
import CoreFoundation

enum TerminalContract {
    static let document: [String: Any] = {
        guard let url = Bundle.main.url(forResource: "terminal-contracts", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }()

    static var tools: [String: [String: Any]] { document["tools"] as? [String: [String: Any]] ?? [:] }
    static func category(_ name: String) -> String {
        (document["categories"] as? [String: String])?[name] ?? "TOOL"
    }

    static func validate(_ name: String, args: [String: Any]) throws -> [String: Any] {
        guard let schema = tools[name]?["parameters"] as? [String: Any] else {
            throw NativeToolError("Unsupported tool: \(name)")
        }
        return try validateValue(args, schema: schema, path: name) as? [String: Any] ?? [:]
    }

    static func validateValue(_ value: Any, schema: [String: Any], path: String) throws -> Any {
        func invalid(_ detail: String) -> NativeToolError { NativeToolError("Invalid arguments for \(path): \(detail)") }
        if let choices = schema["enum"] as? [String], let string = value as? String, !choices.contains(string) {
            throw invalid("unsupported value")
        }
        switch schema["type"] as? String {
        case "object":
            guard let object = value as? [String: Any] else { throw invalid("expected object") }
            let properties = schema["properties"] as? [String: [String: Any]] ?? [:]
            for required in schema["required"] as? [String] ?? [] where object[required] == nil {
                throw invalid("\(required) is required")
            }
            var result: [String: Any] = [:]
            for (key, child) in properties {
                if let input = object[key] ?? child["default"] {
                    result[key] = try validateValue(input, schema: child, path: "\(path).\(key)")
                }
            }
            return result
        case "array":
            guard let array = value as? [Any] else { throw invalid("expected array") }
            if let min = schema["minItems"] as? Int, array.count < min { throw invalid("too few items") }
            if let max = schema["maxItems"] as? Int, array.count > max { throw invalid("too many items") }
            return try array.enumerated().map { try validateValue($0.element, schema: schema["items"] as? [String: Any] ?? [:], path: "\(path)[\($0.offset)]") }
        case "string":
            guard let string = value as? String else { throw invalid("expected string") }
            if let min = schema["minLength"] as? Int, string.utf16.count < min { throw invalid("string is too short") }
            return string
        case "boolean":
            guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { throw invalid("expected boolean") }
            return number.boolValue
        case "integer", "number":
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite else { throw invalid("expected number") }
            let n = number.doubleValue
            if schema["type"] as? String == "integer", n.rounded() != n { throw invalid("expected integer") }
            if let min = schema["minimum"] as? Double, n < min { throw invalid("below minimum") }
            if let max = schema["maximum"] as? Double, n > max { throw invalid("above maximum") }
            return number
        default: return value
        }
    }
}

struct NativeToolError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
