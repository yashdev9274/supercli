import Foundation
import Darwin

actor NativeDiscovery {
    static let shared = NativeDiscovery()

    func files(root: String, include: String? = nil) async throws -> (paths: [String], truncated: Bool) {
        try Task.checkCancellation()
        let git = try await NativeCommandRunner.shared.run(executable: "/usr/bin/git", arguments: ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd: root, timeout: 10_000)
        var paths: [String] = []
        var truncated = git["truncated"] as? Bool == true
        if git["exitCode"] as? Int == 0 {
            let output = git["stdout"] as? String ?? ""
            let complete = output.split(separator: "\0", omittingEmptySubsequences: true)
            // Drop a partial final filename when the preview cap was reached.
            paths = (truncated && !output.hasSuffix("\0") ? complete.dropLast() : complete[...]).map(String.init)
        } else {
            let base = URL(fileURLWithPath: root).resolvingSymlinksInPath()
            let ignored: Set<String> = [".git", "node_modules", ".next", "build", "dist", "DerivedData", ".cache"]
            guard let enumerator = FileManager.default.enumerator(at: base, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey], options: []) else { throw NativeToolError("Cannot list workspace") }
            let deadline = Date().addingTimeInterval(10)
            var visited = 0
            while let url = enumerator.nextObject() as? URL {
                try Task.checkCancellation()
                visited += 1
                if visited > 10_000 || paths.count >= 1000 || Date() >= deadline { truncated = true; break }
                let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
                if ignored.contains(url.lastPathComponent) || values?.isSymbolicLink == true { enumerator.skipDescendants(); continue }
                if values?.isDirectory == true { continue }
                let canonical = url.resolvingSymlinksInPath().path
                guard canonical.hasPrefix(base.path + "/") else { continue }
                paths.append(String(canonical.dropFirst(base.path.count + 1)))
            }
        }
        var seen = Set<String>()
        paths = paths.filter { path in
            guard seen.insert(path).inserted else { return false }
            guard let include, !include.isEmpty else { return true }
            return fnmatch(include, path, 0) == 0 || fnmatch(include, (path as NSString).lastPathComponent, 0) == 0
        }
        if paths.count > 1000 { truncated = true }
        var bounded: [String] = []
        for path in paths.prefix(1000) {
            let url = try NativeFileTools.resolve(path, root: root)
            guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
                  attributes[.type] as? FileAttributeType == .typeRegular,
                  (attributes[.size] as? NSNumber)?.intValue ?? Int.max <= NativeFileTools.maxBytes else { continue }
            bounded.append(path)
        }
        return (bounded, truncated)
    }
}
