import Foundation

@MainActor
final class NativeTurnEngine {
    struct Context {
        let root: String?
        let mode: AgentMode
        let provider: String
        let model: String?
    }
    struct Outcome {
        let history: [[String: Any]]
        let text: String
    }
    private final class Round {
        var text = ""
        var calls: [ToolCallPart] = []
        var error: String?
    }
    typealias Activity = (MessagePart) -> Void
    typealias ResultHandler = (ToolExecutionResult, String) -> Void
    typealias Stream = ([[String: Any]], Context, [[String: Any]], @escaping @Sendable (StreamEvent) async -> Void) async throws -> Void
    nonisolated static let liveStream: Stream = { history, context, tools, event in
        try await SupercodeAPIClient.shared.streamChat(messages: history, provider: context.provider, model: context.model, tools: tools, onEvent: event)
    }

    static func run(history: [[String: Any]], context: Context, budget: Int = 24, depth: Int = 0,
                    whitelist: [String]? = nil, stream: @escaping Stream = liveStream, activity: @escaping Activity,
                    resultHandler: @escaping ResultHandler) async throws -> Outcome {
        var history = history
        var generated: [[String: Any]] = []
        var repetitions: [String: Int] = [:]
        let namespace = UUID().uuidString
        let tools = ToolCatalog.tools(for: context.mode).filter { tool in
            let name = (tool["function"] as? [String: Any])?["name"] as? String ?? ""
            return (depth == 0 || !["delegate", "task", "switch_to_agent_mode"].contains(name)) && (whitelist == nil || whitelist!.contains(name))
        }
        let allowed = Set(tools.compactMap { ($0["function"] as? [String: Any])?["name"] as? String })
        for step in 0..<budget {
            try Task.checkCancellation()
            let round = Round()
            var textID = UUID().uuidString, reasoningID = UUID().uuidString
            var lastKind = ""
            activity(.reasoning(id: UUID().uuidString, content: "Analyzing · step \(step + 1)"))
            try await stream(history, context, tools) { event in
                await MainActor.run {
                    guard !Task.isCancelled else { return }
                    switch event {
                    case .text(let text):
                        if lastKind != "text" { textID = UUID().uuidString }
                        lastKind = "text"
                        round.text += text
                        activity(.text(id: textID, content: text))
                    case .reasoning(let text):
                        if lastKind != "reasoning" { reasoningID = UUID().uuidString }
                        lastKind = "reasoning"
                        activity(.reasoning(id: reasoningID, content: text))
                    case .toolCall(let rawID, let rawName, let args):
                        lastKind = "tool"
                        let id = "\(namespace)-\(step)-\(rawID)"
                        guard !round.calls.contains(where: { $0.id == id }) else { return }
                        let part = ToolCallPart(id: id, toolName: LocalToolRuntime.canonicalizeName(rawName), args: args, status: .queued, isExpanded: false)
                        round.calls.append(part)
                        activity(.toolCall(part))
                    case .error(let error): round.error = error
                    case .status, .finish: break
                    }
                }
            }
            try Task.checkCancellation()
            if let error = round.error { throw NativeToolError(error) }
            if round.calls.isEmpty {
                let final: [String: Any] = ["role": "assistant", "content": round.text]
                generated.append(final)
                return Outcome(history: generated, text: round.text)
            }
            let callMessage: [String: Any] = ["role": "assistant", "content": round.text, "tool_calls": round.calls.map { call in
                ["id": call.id, "type": "function", "function": ["name": call.toolName, "arguments": json(call.args.mapValues(\.value))]] as [String: Any]
            }]
            history.append(callMessage); generated.append(callMessage)
            var stopReason: String?
            for var call in round.calls {
                try Task.checkCancellation()
                let args = call.args.mapValues(\.value)
                let key = call.toolName + json(args)
                repetitions[key, default: 0] += 1
                call.status = .running
                activity(.toolCall(call))
                let started = Date()
                let result: ToolExecutionResult
                if stopReason != nil {
                    result = LocalToolRuntime.failJSON(cancelled: true, reason: "Skipped: waiting for user input")
                } else if !allowed.contains(call.toolName) {
                    result = LocalToolRuntime.failJSON(cancelled: false, reason: "Tool is not allowed in this task", denied: true)
                } else if repetitions[key, default: 0] > 2 {
                    result = LocalToolRuntime.failJSON(cancelled: false, reason: "Stopped repeated identical tool calls. Change the approach or ask the user.")
                    stopReason = result.preview
                } else if ["delegate", "task"].contains(call.toolName) {
                    result = await delegate(name: call.toolName, args: args, context: context, depth: depth, stream: stream, activity: activity, resultHandler: resultHandler)
                } else {
                    result = await LocalToolRuntime.execute(name: call.toolName, args: args, workspaceRoot: context.root, mode: context.mode)
                }
                try Task.checkCancellation()
                let object = (try? JSONSerialization.jsonObject(with: Data(result.json.utf8))) as? [String: Any]
                call.status = result.cancelled ? .cancelled : object?["denied"] as? Bool == true ? .denied : result.success ? .completed : .failed
                call.durationMs = Int(Date().timeIntervalSince(started) * 1000)
                call.resultPreview = result.preview
                call.resultJSON = result.json
                activity(.toolCall(call))
                resultHandler(result, call.toolName)
                let message: [String: Any] = ["role": "tool", "tool_call_id": call.id, "name": call.toolName, "content": result.json]
                history.append(message); generated.append(message)
                if call.status == .denied { stopReason = "Permission denied. Waiting for your instructions." }
                if call.toolName == "question", result.success {
                    let questions = args["questions"] as? [[String: Any]] ?? []
                    stopReason = questions.map { question in
                        let options = (question["options"] as? [[String: Any]] ?? []).compactMap { $0["label"] as? String }
                        return (question["question"] as? String ?? "") + (options.isEmpty ? "" : "\n" + options.map { "- \($0)" }.joined(separator: "\n"))
                    }.joined(separator: "\n\n")
                }
                if call.toolName == "switch_to_agent_mode", result.success { stopReason = "Select Agent mode to implement these changes, then send your request again." }
            }
            if let stopReason {
                activity(.text(id: UUID().uuidString, content: stopReason))
                generated.append(["role": "assistant", "content": stopReason])
                return Outcome(history: generated, text: stopReason)
            }
        }
        let message = "Stopped after reaching the \(budget)-step budget. Review the results before continuing."
        activity(.text(id: UUID().uuidString, content: message))
        generated.append(["role": "assistant", "content": message])
        return Outcome(history: generated, text: message)
    }

    private static func delegate(name: String, args: [String: Any], context: Context, depth: Int,
                                 stream: @escaping Stream, activity: @escaping Activity, resultHandler: @escaping ResultHandler) async -> ToolExecutionResult {
        do {
            guard depth == 0 else { throw NativeToolError("Nested delegation is not supported") }
            let args = try TerminalContract.validate(name, args: args)
            let items = name == "task" ? Array((args["items"] as? [[String: Any]] ?? []).prefix(8)) : [args]
            // Permission dialogs are shared; serialize write-capable children. Read-only tasks can run in batches of three.
            let parallel = args["parallel"] as? Bool == true && items.allSatisfy { $0["agent"] as? String != "general" }
            func one(_ index: Int, _ item: [String: Any]) async -> [String: Any] {
                do {
                    try Task.checkCancellation()
                    let mode: AgentMode = item["agent"] as? String == "general" && [.tools, .agent].contains(context.mode) ? context.mode : .chat
                    let childContext = Context(root: context.root, mode: mode, provider: context.provider, model: context.model)
                    let history: [[String: Any]] = [
                        ["role": "system", "content": ToolCatalog.systemPrompt(mode: mode, workspacePath: context.root, gitBranch: nil, effort: .medium)],
                        ["role": "user", "content": item["task"] as? String ?? ""],
                    ]
                    let outcome = try await run(history: history, context: childContext, budget: item["budget"] as? Int ?? 10, depth: depth + 1, whitelist: item["tools"] as? [String], stream: stream, activity: { part in
                        // Child prose is analysis, never a duplicate parent final answer.
                        if case .text(let id, let text) = part { activity(.reasoning(id: id, content: text)) }
                        else { activity(part) }
                    }, resultHandler: resultHandler)
                    return ["index": index, "success": true, "summary": outcome.text]
                } catch { return ["index": index, "success": false, "error": error.localizedDescription] }
            }
            var results: [[String: Any]] = []
            if parallel {
                for start in stride(from: 0, to: items.count, by: 3) {
                    let batch = Array(items.enumerated().dropFirst(start).prefix(3))
                    let values = await withTaskGroup(of: [String: Any].self) { group in
                        for (index, item) in batch { group.addTask { await one(index, item) } }
                        var values: [[String: Any]] = []
                        for await value in group { values.append(value) }
                        return values
                    }
                    results += values
                }
            } else {
                for (index, item) in items.enumerated() { results.append(await one(index, item)) }
            }
            try Task.checkCancellation()
            results.sort { ($0["index"] as? Int ?? 0) < ($1["index"] as? Int ?? 0) }
            let success = results.allSatisfy { $0["success"] as? Bool == true }
            var result = LocalToolRuntime.okJSON(["success": success, "results": results], preview: "\(results.count) delegated tasks")
            result.success = success
            return result
        } catch { return LocalToolRuntime.failJSON(cancelled: Task.isCancelled, reason: error.localizedDescription) }
    }

    static func json(_ value: Any) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let string = String(data: data, encoding: .utf8) else { return "{}" }
        return string
    }
}
