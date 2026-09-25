import Foundation

enum NativeFileReferences {
    static func mentions(_ prompt: String) -> [String] {
        let regex = try? NSRegularExpression(pattern: #"(?:^|\s)@(?:\"([^\"]+)\"|([^\s,;!?]+))"#)
        var seen = Set<String>()
        return (regex?.matches(in: prompt, range: NSRange(prompt.startIndex..., in: prompt)) ?? []).compactMap { match in
            let group = match.range(at: 1).location == NSNotFound ? 2 : 1
            guard let range = Range(match.range(at: group), in: prompt) else { return nil }
            let name = String(prompt[range]).trimmingCharacters(in: CharacterSet(charactersIn: "`"))
            return seen.insert(name).inserted ? name : nil
        }.prefix(8).map { $0 }
    }

    static func lookup(_ name: String, root: String) async throws -> String {
        let direct = try NativeFileTools.resolve(name, root: root)
        if FileManager.default.fileExists(atPath: direct.path) { return name }
        let listing = try await NativeDiscovery.shared.files(root: root)
        let candidates = listing.paths.filter { $0 == name || $0.hasSuffix("/" + name) }
        guard candidates.count == 1, let path = candidates.first else {
            throw NativeToolError(candidates.isEmpty ? "Reference not found: \(name) (bounded lookup)" : "Ambiguous reference: \(name). Use a workspace-relative path.")
        }
        _ = try NativeFileTools.resolve(path, root: root)
        return path
    }

    @MainActor
    static func resolve(prompt: String, context: NativeTurnEngine.Context, activity: @escaping NativeTurnEngine.Activity) async throws -> [[String: Any]] {
        var history: [[String: Any]] = []
        var readPaths = Set<String>()
        for name in mentions(prompt) {
            try Task.checkCancellation()
            var lookup = ToolCallPart(id: "reference-\(UUID().uuidString)", toolName: "search_files", args: ["pattern": AnyCodable(name)], status: .running, isExpanded: false)
            activity(.toolCall(lookup))
            do {
                guard let root = context.root else { throw NativeToolError("Open a workspace to read @\(name)") }
                let path = try await self.lookup(name, root: root)
                lookup.status = .completed
                lookup.resultPreview = "Found \(path)"
                activity(.toolCall(lookup))
                let resolvedPath = try NativeFileTools.resolve(path, root: root).path
                guard readPaths.insert(resolvedPath).inserted else { continue }
                let args: [String: Any] = ["path": path, "startLine": 1, "maxLines": 300]
                var read = ToolCallPart(id: "reference-\(UUID().uuidString)", toolName: "read_file", args: args.mapValues(AnyCodable.init), status: .running, isExpanded: false)
                activity(.toolCall(read))
                let result = await LocalToolRuntime.execute(name: "read_file", args: args, workspaceRoot: root, mode: context.mode)
                try Task.checkCancellation()
                read.status = result.success ? .completed : .failed
                read.resultPreview = result.preview
                read.resultJSON = result.json
                activity(.toolCall(read))
                history += [
                    ["role": "assistant", "content": "", "tool_calls": [["id": read.id, "type": "function", "function": ["name": "read_file", "arguments": NativeTurnEngine.json(args)]]]],
                    ["role": "tool", "tool_call_id": read.id, "name": "read_file", "content": result.json],
                ]
            } catch {
                if Task.isCancelled { throw CancellationError() }
                lookup.status = .failed
                lookup.resultPreview = error.localizedDescription
                activity(.toolCall(lookup))
                history.append(["role": "user", "content": "Reference resolution failed for @\(name): \(error.localizedDescription). Do not assume its contents."])
            }
        }
        return history
    }
}
