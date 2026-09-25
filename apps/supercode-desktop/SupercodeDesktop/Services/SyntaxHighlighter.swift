import AppKit
import SwiftUI

/// Lightweight token highlighter for the main-pane file viewer (desk9-style).
enum SyntaxHighlighter {
    enum TokenKind {
        case plain
        case keyword
        case string
        case comment
        case number
        case typeName
        case property
        case punct
        case tag
        case attribute
        case heading
        case mdCode
        case mdEmphasis
    }

    struct Token {
        let text: String
        let kind: TokenKind
    }

    static func language(for path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        switch ext {
        case "ts", "tsx", "js", "jsx", "mjs", "cjs": return "js"
        case "swift": return "swift"
        case "py": return "py"
        case "go": return "go"
        case "rs": return "rs"
        case "java", "kt", "kts": return "java"
        case "rb": return "rb"
        case "css", "scss": return "css"
        case "html", "htm", "xml", "svg": return "html"
        case "json": return "json"
        case "yml", "yaml": return "yaml"
        case "md", "mdx", "markdown": return "md"
        case "sh", "bash", "zsh": return "sh"
        case "toml": return "toml"
        case "c", "h", "cpp", "hpp", "cc", "m", "mm": return "c"
        default: return "plain"
        }
    }

    static func color(for kind: TokenKind) -> Color {
        switch kind {
        case .plain: return DesktopTheme.textPrimary
        case .keyword: return Color(red: 0.78, green: 0.45, blue: 0.90) // purple
        case .string: return Color(red: 0.45, green: 0.78, blue: 0.52) // green
        case .comment: return Color(red: 0.42, green: 0.48, blue: 0.42)
        case .number: return Color(red: 0.85, green: 0.65, blue: 0.35)
        case .typeName: return Color(red: 0.45, green: 0.72, blue: 0.90)
        case .property: return Color(red: 0.72, green: 0.78, blue: 0.92)
        case .punct: return DesktopTheme.textSecondary
        case .tag: return Color(red: 0.40, green: 0.70, blue: 0.95)
        case .attribute: return Color(red: 0.85, green: 0.70, blue: 0.40)
        case .heading: return Color(red: 0.96, green: 0.62, blue: 0.18)
        case .mdCode: return Color(red: 0.85, green: 0.72, blue: 0.45)
        case .mdEmphasis: return Color(red: 0.75, green: 0.70, blue: 0.95)
        }
    }

    static func tokens(for line: String, language: String) -> [Token] {
        switch language {
        case "md": return markdownTokens(line)
        case "json": return jsonTokens(line)
        case "html", "xml": return markupTokens(line)
        case "yaml", "toml": return yamlishTokens(line)
        case "plain": return [.init(text: line.isEmpty ? " " : line, kind: .plain)]
        default: return codeTokens(line, language: language)
        }
    }

    // MARK: - Code languages

    private static func keywords(for language: String) -> Set<String> {
        switch language {
        case "js":
            return [
                "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
                "switch", "case", "break", "continue", "class", "extends", "import", "export",
                "from", "default", "async", "await", "try", "catch", "finally", "throw", "new",
                "typeof", "instanceof", "in", "of", "this", "super", "static", "get", "set",
                "true", "false", "null", "undefined", "void", "yield", "interface", "type",
                "enum", "implements", "public", "private", "protected", "readonly", "as",
                "namespace", "module", "declare", "abstract", "satisfies", "keyof", "infer",
            ]
        case "swift":
            return [
                "import", "struct", "class", "enum", "protocol", "extension", "func", "var", "let",
                "if", "else", "guard", "switch", "case", "default", "for", "in", "while", "repeat",
                "return", "throw", "throws", "try", "catch", "async", "await", "actor", "some",
                "any", "Self", "self", "super", "static", "private", "public", "internal",
                "fileprivate", "open", "final", "override", "mutating", "nonmutating", "lazy",
                "weak", "unowned", "true", "false", "nil", "where", "associatedtype", "typealias",
                "init", "deinit", "subscript", "operator", "inout", "as", "is", "defer",
            ]
        case "py":
            return [
                "def", "class", "return", "if", "elif", "else", "for", "while", "import", "from",
                "as", "with", "try", "except", "finally", "raise", "pass", "break", "continue",
                "yield", "lambda", "True", "False", "None", "and", "or", "not", "in", "is",
                "global", "nonlocal", "async", "await", "assert", "del", "match", "case",
            ]
        case "go":
            return [
                "package", "import", "func", "return", "if", "else", "for", "range", "switch",
                "case", "default", "break", "continue", "go", "defer", "chan", "select", "type",
                "struct", "interface", "map", "var", "const", "true", "false", "nil", "make",
                "new", "fallthrough", "goto",
            ]
        case "rs":
            return [
                "fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "pub", "use",
                "mod", "crate", "self", "super", "return", "if", "else", "match", "loop", "while",
                "for", "in", "break", "continue", "async", "await", "move", "ref", "static",
                "true", "false", "where", "type", "as", "dyn", "unsafe",
            ]
        case "java":
            return [
                "class", "interface", "enum", "extends", "implements", "public", "private",
                "protected", "static", "final", "void", "return", "if", "else", "for", "while",
                "do", "switch", "case", "break", "continue", "try", "catch", "finally", "throw",
                "throws", "new", "this", "super", "import", "package", "true", "false", "null",
                "abstract", "synchronized", "volatile", "transient", "native", "strictfp",
            ]
        case "c":
            return [
                "int", "char", "void", "float", "double", "long", "short", "unsigned", "signed",
                "const", "static", "extern", "return", "if", "else", "for", "while", "do",
                "switch", "case", "break", "continue", "struct", "typedef", "enum", "union",
                "sizeof", "goto", "volatile", "register", "inline", "true", "false", "NULL",
                "class", "public", "private", "protected", "namespace", "template", "typename",
                "using", "new", "delete", "this", "virtual", "override", "bool",
            ]
        case "sh":
            return [
                "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
                "function", "return", "in", "export", "local", "readonly", "declare", "set",
                "unset", "shift", "echo", "printf", "cd", "exit", "true", "false",
            ]
        case "css":
            return [
                "important", "from", "to", "and", "or", "not", "only", "screen", "print",
            ]
        default:
            return []
        }
    }

    private static func codeTokens(_ line: String, language: String) -> [Token] {
        if line.isEmpty { return [.init(text: " ", kind: .plain)] }
        var result: [Token] = []
        let chars = Array(line)
        var i = 0
        let kws = keywords(for: language)

        // Full-line comment
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if language == "py" && trimmed.hasPrefix("#") {
            return [.init(text: line, kind: .comment)]
        }
        if (language == "js" || language == "swift" || language == "go" || language == "rs"
            || language == "java" || language == "c" || language == "css")
            && (trimmed.hasPrefix("//") || trimmed.hasPrefix("/*") || trimmed.hasPrefix("*")) {
            return [.init(text: line, kind: .comment)]
        }

        while i < chars.count {
            let c = chars[i]

            // Whitespace
            if c.isWhitespace {
                var j = i
                while j < chars.count && chars[j].isWhitespace { j += 1 }
                result.append(.init(text: String(chars[i..<j]), kind: .plain))
                i = j
                continue
            }

            // Line comment //
            if c == "/", i + 1 < chars.count, chars[i + 1] == "/" {
                result.append(.init(text: String(chars[i...]), kind: .comment))
                break
            }
            // Block comment start
            if c == "/", i + 1 < chars.count, chars[i + 1] == "*" {
                result.append(.init(text: String(chars[i...]), kind: .comment))
                break
            }
            // Hash comment
            if c == "#" && language != "js" {
                result.append(.init(text: String(chars[i...]), kind: .comment))
                break
            }

            // Strings
            if c == "\"" || c == "'" || c == "`" {
                let quote = c
                var j = i + 1
                while j < chars.count {
                    if chars[j] == "\\" { j += 2; continue }
                    if chars[j] == quote { j += 1; break }
                    j += 1
                }
                result.append(.init(text: String(chars[i..<min(j, chars.count)]), kind: .string))
                i = j
                continue
            }

            // Numbers
            if c.isNumber || (c == "." && i + 1 < chars.count && chars[i + 1].isNumber) {
                var j = i
                while j < chars.count && (chars[j].isNumber || chars[j] == "." || chars[j] == "x" || chars[j] == "e" || chars[j] == "E" || chars[j] == "_") {
                    j += 1
                }
                result.append(.init(text: String(chars[i..<j]), kind: .number))
                i = j
                continue
            }

            // Identifiers / keywords
            if c.isLetter || c == "_" || c == "$" {
                var j = i
                while j < chars.count && (chars[j].isLetter || chars[j].isNumber || chars[j] == "_" || chars[j] == "$") {
                    j += 1
                }
                let word = String(chars[i..<j])
                let kind: TokenKind
                if kws.contains(word) {
                    kind = .keyword
                } else if word.first?.isUppercase == true {
                    kind = .typeName
                } else if j < chars.count && chars[j] == "(" {
                    kind = .property
                } else {
                    kind = .plain
                }
                result.append(.init(text: word, kind: kind))
                i = j
                continue
            }

            // JSX/HTML-ish tags in js/tsx
            if c == "<" && (language == "js" || language == "html") {
                var j = i + 1
                if j < chars.count && (chars[j].isLetter || chars[j] == "/" || chars[j] == "!") {
                    while j < chars.count && chars[j] != ">" { j += 1 }
                    if j < chars.count { j += 1 }
                    result.append(.init(text: String(chars[i..<j]), kind: .tag))
                    i = j
                    continue
                }
            }

            // Punctuation single char
            result.append(.init(text: String(c), kind: .punct))
            i += 1
        }

        return result.isEmpty ? [.init(text: " ", kind: .plain)] : result
    }

    private static func markdownTokens(_ line: String) -> [Token] {
        if line.isEmpty { return [.init(text: " ", kind: .plain)] }
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("#") {
            return [.init(text: line, kind: .heading)]
        }
        if t.hasPrefix("```") || t.hasPrefix("`") && t.hasSuffix("`") {
            return [.init(text: line, kind: .mdCode)]
        }
        if t.hasPrefix(">") || t.hasPrefix("- ") || t.hasPrefix("* ") || t.hasPrefix("|") {
            return [.init(text: line, kind: .mdEmphasis)]
        }
        // Inline code segments
        var result: [Token] = []
        var rest = line
        while let start = rest.firstIndex(of: "`") {
            let before = String(rest[..<start])
            if !before.isEmpty { result.append(.init(text: before, kind: .plain)) }
            rest = String(rest[rest.index(after: start)...])
            if let end = rest.firstIndex(of: "`") {
                let code = "`" + String(rest[..<end]) + "`"
                result.append(.init(text: code, kind: .mdCode))
                rest = String(rest[rest.index(after: end)...])
            } else {
                result.append(.init(text: "`" + rest, kind: .mdCode))
                rest = ""
            }
        }
        if !rest.isEmpty { result.append(.init(text: rest, kind: .plain)) }
        return result.isEmpty ? [.init(text: line, kind: .plain)] : result
    }

    private static func jsonTokens(_ line: String) -> [Token] {
        codeTokens(line, language: "js").map { tok in
            if tok.text.hasPrefix("\"") && tok.text.hasSuffix("\"") && line.contains(tok.text + ":") {
                return Token(text: tok.text, kind: .property)
            }
            return tok
        }
    }

    private static func markupTokens(_ line: String) -> [Token] {
        if line.trimmingCharacters(in: .whitespaces).hasPrefix("<!--") {
            return [.init(text: line, kind: .comment)]
        }
        return codeTokens(line, language: "html")
    }

    private static func yamlishTokens(_ line: String) -> [Token] {
        let t = line.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("#") { return [.init(text: line, kind: .comment)] }
        if let colon = line.firstIndex(of: ":") {
            let key = String(line[..<colon])
            let rest = String(line[colon...])
            return [
                .init(text: key, kind: .property),
                .init(text: rest, kind: rest.contains("\"") || rest.contains("'") ? .string : .plain),
            ]
        }
        return [.init(text: line.isEmpty ? " " : line, kind: .plain)]
    }
}

struct SyntaxLineView: View {
    let lineNumber: Int
    let text: String
    let language: String
    var isCurrent: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text("\(lineNumber)")
                .font(DesktopTheme.monoTiny)
                .foregroundStyle(isCurrent ? DesktopTheme.accent : DesktopTheme.textMuted)
                .frame(width: 44, alignment: .trailing)
                .padding(.trailing, 12)

            highlighted
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 1)
        .padding(.trailing, 12)
        .background(isCurrent ? DesktopTheme.panelElevated.opacity(0.55) : Color.clear)
    }

    private var highlighted: some View {
        let tokens = SyntaxHighlighter.tokens(for: text, language: language)
        return tokens.reduce(Text("")) { partial, token in
            partial + Text(token.text)
                .font(DesktopTheme.monoSmall)
                .foregroundColor(SyntaxHighlighter.color(for: token.kind))
        }
        .textSelection(.enabled)
    }
}
