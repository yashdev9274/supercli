import Foundation
import CryptoKit
import Darwin

actor NativeFileTools {
    static let shared = NativeFileTools()
    static let maxBytes = 1_000_000

    static func resolve(_ path: String, root: String) throws -> URL {
        let base = URL(fileURLWithPath: root).standardizedFileURL.resolvingSymlinksInPath()
        let candidate = (path as NSString).isAbsolutePath ? URL(fileURLWithPath: path) : base.appendingPathComponent(path)
        let lexical = candidate.standardizedFileURL
        let resolved = lexical.resolvingSymlinksInPath()
        guard resolved.path == base.path || resolved.path.hasPrefix(base.path + "/") else {
            throw NativeToolError("Path is outside workspace: \(path)")
        }
        var ancestor = lexical
        while ancestor.path != "/" {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: ancestor.path),
               attrs[.type] as? FileAttributeType == .typeSymbolicLink,
               !FileManager.default.fileExists(atPath: ancestor.path) {
                throw NativeToolError("Dangling symbolic link: \(path)")
            }
            ancestor.deleteLastPathComponent()
        }
        return resolved
    }

    static func version(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func load(_ url: URL) throws -> String {
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        guard fd >= 0 else { throw NativeToolError("Cannot read \(url.lastPathComponent)") }
        defer { close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG else { throw NativeToolError("Not a regular file") }
        guard info.st_size <= maxBytes else { throw NativeToolError("File exceeds 1MB limit") }
        var data = Data(), buffer = [UInt8](repeating: 0, count: 8192)
        while true {
            let count = read(fd, &buffer, buffer.count)
            if count == 0 { break }
            guard count > 0 else { throw NativeToolError("Failed to read file") }
            data.append(contentsOf: buffer.prefix(count))
            guard data.count <= maxBytes else { throw NativeToolError("File exceeds 1MB limit") }
        }
        guard !data.contains(0), let text = String(data: data, encoding: .utf8) else { throw NativeToolError("Binary or non-UTF8 file") }
        return text
    }

    func execute(_ name: String, args: [String: Any], root: String) throws -> ToolExecutionResult {
        try Task.checkCancellation()
        let path = args["path"] as? String ?? ""
        let url = try Self.resolve(path, root: root)
        let base = URL(fileURLWithPath: root).resolvingSymlinksInPath().path
        let relative = String(url.path.dropFirst(base.count + 1))
        if name == "read_file" {
            let text = try Self.load(url)
            let lines = text.components(separatedBy: "\n")
            let start = args["startLine"] as? Int ?? 1
            let limit = args["maxLines"] as? Int ?? 300
            let selected = Array(lines.dropFirst(start - 1).prefix(limit))
            var kept: [String] = [], count = 0
            for line in selected {
                if count + line.utf16.count + 1 > 60_000 { break }
                kept.append(line); count += line.utf16.count + 1
            }
            // A single long line still yields useful bounded content.
            if kept.isEmpty, let first = selected.first { kept = [String(first.prefix(60_000))] }
            let end = start + kept.count - 1
            let truncated = end < lines.count || count > 60_000 || (selected.first?.count ?? 0) > 60_000
            var payload: [String: Any] = ["path": relative, "content": kept.joined(separator: "\n"), "totalLines": lines.count, "startLine": start, "endLine": end, "truncated": truncated, "version": Self.version(text)]
            if end < lines.count { payload["nextLine"] = end + 1 }
            return LocalToolRuntime.okJSON(payload, preview: "read \(relative)")
        }
        let exists = FileManager.default.fileExists(atPath: url.path)
        let previous = exists ? try Self.load(url) : nil
        if let expected = args["expectedVersion"] as? String, expected != previous.map(Self.version) {
            throw NativeToolError("File changed since it was read. Re-read before editing.")
        }
        var content = args["content"] as? String ?? ""
        var replacements = 0
        if name == "edit_file" {
            guard let previous else { throw NativeToolError("File does not exist; use write_file") }
            let old = args["oldText"] as? String ?? ""
            guard !old.isEmpty else { throw NativeToolError("oldText must not be empty") }
            replacements = previous.components(separatedBy: old).count - 1
            guard replacements > 0 else { throw NativeToolError("oldText not found; re-read the file") }
            guard replacements == 1 || args["replaceAll"] as? Bool == true else { throw NativeToolError("Ambiguous oldText; refine it or use replaceAll") }
            content = previous.replacingOccurrences(of: old, with: args["newText"] as? String ?? "")
        }
        guard content.utf8.count <= Self.maxBytes, !content.contains("\0") else { throw NativeToolError("Binary content or file exceeds 1MB limit") }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let temp = url.deletingLastPathComponent().appendingPathComponent(".supercode-\(UUID().uuidString).tmp")
        let fd = open(temp.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw NativeToolError("Cannot create atomic write temporary file") }
        defer { close(fd); unlink(temp.path) }
        if exists {
            let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
            if let mode = attrs[.posixPermissions] as? NSNumber { fchmod(fd, mode_t(mode.uint16Value)) }
        }
        try Data(content.utf8).withUnsafeBytes { buffer in
            var offset = 0
            while offset < buffer.count {
                let count = write(fd, buffer.baseAddress!.advanced(by: offset), buffer.count - offset)
                guard count > 0 else { throw NativeToolError("File write failed") }
                offset += count
            }
        }
        try Task.checkCancellation()
        guard try Self.resolve(path, root: root) == url else { throw NativeToolError("Path changed during write") }
        let now = FileManager.default.fileExists(atPath: url.path) ? try Self.load(url) : nil
        guard now == previous else { throw NativeToolError("File changed during write; retry after reading") }
        guard rename(temp.path, url.path) == 0 else { throw NativeToolError("Atomic rename failed") }
        var result = LocalToolRuntime.okJSON(["path": relative, "size": content.utf8.count, "action": name == "edit_file" ? "edited" : exists ? "overwritten" : "created", "replacements": replacements, "version": Self.version(content)], preview: "\(name == "edit_file" ? "edited" : "wrote") \(relative)")
        result.mutatedAbsolutePath = url.path
        result.mutatedRelativePath = relative
        result.previousContent = previous
        result.newContent = content
        return result
    }
}
