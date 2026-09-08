import XCTest
@testable import Supercode

final class ParityTests: XCTestCase {
    func workspace() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("supercode-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    func testDistributionConfiguration() throws {
        XCTAssertEqual(ServerConfig.resolvedClientID(stored: nil), "ai.supercode.desktop")
        XCTAssertEqual(ServerConfig.resolvedClientID(stored: "  \n"), "ai.supercode.desktop")
        XCTAssertEqual(ServerConfig.resolvedClientID(stored: " custom "), "custom")
        XCTAssertEqual(ServerConfig.resolvedURL(stored: nil), ServerConfig.defaultURL)
        XCTAssertEqual(URL(string: ServerConfig.productionURL)?.scheme, "https")
        #if DEBUG
        XCTAssertEqual(ServerConfig.defaultURL, ServerConfig.localURL)
        #else
        XCTAssertEqual(ServerConfig.defaultURL, ServerConfig.productionURL)
        #endif
        let version = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String)
        XCTAssertNotNil(version.range(of: #"^\d+\.\d+\.\d+$"#, options: .regularExpression))
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleIconName") as? String, "AppIcon")
    }

    func testContractsAndModes() throws {
        XCTAssertEqual(TerminalContract.tools.count, 12)
        for mode in AgentMode.allCases {
            let definitions = ToolCatalog.tools(for: mode)
            XCTAssertEqual(definitions.count, ToolCatalog.toolNames(for: mode).count)
            for definition in definitions {
                XCTAssertNotNil((definition["function"] as? [String: Any])?["name"])
            }
            XCTAssertFalse(ToolCatalog.toolNames(for: mode).contains("code_exec"))
        }
        XCTAssertFalse(ToolCatalog.toolNames(for: .plan).contains("write_file"))
        XCTAssertFalse(ToolCatalog.toolNames(for: .chat).contains("run_command"))
        XCTAssertEqual(AgentMode.compatible("unknown"), .plan)
        XCTAssertEqual(AgentMode.compatible("explore"), .chat)
        XCTAssertEqual(AgentMode.compatible("build"), .agent)
        XCTAssertEqual(try TerminalContract.validate("read_file", args: ["path": "a"])["maxLines"] as? Int, 300)
        XCTAssertThrowsError(try TerminalContract.validate("exa_search", args: [:]))
        XCTAssertThrowsError(try TerminalContract.validate("exa_search", args: ["query": "x", "maxResults": 51]))
        XCTAssertThrowsError(try TerminalContract.validate("exa_search", args: ["query": "x", "maxResults": true]))
        XCTAssertThrowsError(try TerminalContract.validate("exa_search", args: ["query": "x", "maxResults": 1.5]))
        XCTAssertThrowsError(try TerminalContract.validate("question", args: ["prompt": "old contract"]))
    }

    func testSearchFallbackAndDomains() async throws {
        var requests: [(String, [String: Any])] = []
        let result = try await NativeWebSearch.search(name: "firecrawl_search", args: ["query": "Swift", "maxResults": 80, "includeDomains": ["swift.org"], "excludeDomains": ["example.com"]]) { provider, body in
            requests.append((provider, body))
            if provider == "firecrawl" { throw NativeToolError("Unavailable") }
            return ["results": [["title": "Swift", "url": "https://swift.org", "text": "Language"]]]
        }
        XCTAssertEqual(requests.map(\.0), ["firecrawl", "exa"])
        XCTAssertEqual(requests[1].1["numResults"] as? Int, 50)
        XCTAssertEqual(requests[1].1["includeDomains"] as? [String], ["swift.org"])
        XCTAssertEqual(requests[1].1["excludeDomains"] as? [String], ["example.com"])
        XCTAssertEqual(result["provider"] as? String, "exa")
        XCTAssertEqual((result["results"] as? [[String: Any]])?.first?["link"] as? String, "https://swift.org")
    }

    func testSearchEmptyAndMalformed() async throws {
        var count = 0
        let empty = try await NativeWebSearch.search(name: "exa_search", args: ["query": "nothing"]) { _, _ in
            count += 1
            return ["results": []]
        }
        XCTAssertEqual(count, 1)
        XCTAssertEqual((empty["results"] as? [Any])?.count, 0)
        do {
            _ = try await NativeWebSearch.search(name: "exa_search", args: ["query": "test"]) { _, _ in [:] }
            XCTFail("Malformed response must fail")
        } catch { XCTAssertTrue(error.localizedDescription.contains("Malformed")) }
    }

    func testFilesVersionBoundsAndSymlinks() async throws {
        let root = try workspace()
        let file = root.appendingPathComponent("a.txt")
        try "one\ntwo\nthree".write(to: file, atomically: true, encoding: .utf8)
        let read = try await NativeFileTools.shared.execute("read_file", args: ["path": "a.txt", "startLine": 2, "maxLines": 1], root: root.path)
        let payload = try JSONSerialization.jsonObject(with: Data(read.json.utf8)) as! [String: Any]
        let data = payload["data"] as! [String: Any]
        XCTAssertEqual(data["content"] as? String, "two")
        XCTAssertEqual(data["nextLine"] as? Int, 3)
        XCTAssertEqual((data["version"] as? String)?.count, 64)
        do {
            _ = try await NativeFileTools.shared.execute("edit_file", args: ["path": "a.txt", "oldText": "one", "newText": "four", "expectedVersion": "stale"], root: root.path)
            XCTFail("Stale write must fail")
        } catch {}
        let edit = try await NativeFileTools.shared.execute("edit_file", args: ["path": "a.txt", "oldText": "one", "newText": "four", "expectedVersion": data["version"]!], root: root.path)
        XCTAssertTrue(edit.success)
        XCTAssertEqual(try String(contentsOf: file), "four\ntwo\nthree")
        try FileManager.default.createSymbolicLink(atPath: root.appendingPathComponent("escape").path, withDestinationPath: "/etc")
        XCTAssertThrowsError(try NativeFileTools.resolve("escape/passwd", root: root.path))
        XCTAssertThrowsError(try NativeFileTools.resolve("../outside", root: root.path))
        try Data(repeating: 65, count: 1_000_001).write(to: root.appendingPathComponent("large"))
        XCTAssertThrowsError(try NativeFileTools.load(root.appendingPathComponent("large")))
        try Data([0, 1]).write(to: root.appendingPathComponent("binary"))
        XCTAssertThrowsError(try NativeFileTools.load(root.appendingPathComponent("binary")))
    }

    func testOutputHeavyCommandAndTimeout() async throws {
        let root = try workspace()
        let output = try await NativeCommandRunner.shared.run(arguments: ["-c", "i=0; while [ $i -lt 12000 ]; do printf 'abcdefghij\\n'; printf 'abcdefghij\\n' >&2; i=$((i+1)); done"], cwd: root.path, timeout: 10_000)
        XCTAssertEqual(output["exitCode"] as? Int, 0)
        XCTAssertEqual(output["truncated"] as? Bool, true)
        XCTAssertLessThanOrEqual((output["stdout"] as? String ?? "").utf8.count, 60_000)
        let start = Date()
        let timeout = try await NativeCommandRunner.shared.run(arguments: ["-c", "sleep 30"], cwd: root.path, timeout: 100)
        XCTAssertEqual(timeout["timedOut"] as? Bool, true)
        XCTAssertLessThan(Date().timeIntervalSince(start), 3)
    }

    func testCommandCancellation() async throws {
        let root = try workspace()
        let task = Task { try await NativeCommandRunner.shared.run(arguments: ["-c", "sleep 30"], cwd: root.path, timeout: 30_000) }
        try await Task.sleep(for: .milliseconds(100))
        task.cancel()
        let result = try await task.value
        XCTAssertEqual(result["cancelled"] as? Bool, true)
        XCTAssertEqual(result["success"] as? Bool, false)
    }

    func testChronologyAndHistoryRoundTrip() throws {
        var message = ChatMessage(role: .assistant, content: "")
        message.apply(.reasoning(id: "a", content: "before"))
        message.apply(.toolCall(ToolCallPart(id: "tool", toolName: "read_file", args: [:], status: .queued, isExpanded: false)))
        message.apply(.reasoning(id: "b", content: "after"))
        message.apply(.text(id: "c", content: "answer"))
        message.apply(.text(id: "c", content: " continued"))
        message.apply(.toolCall(ToolCallPart(id: "tool", toolName: "read_file", args: [:], status: .completed, isExpanded: false)))
        XCTAssertEqual(message.parts.map(\.id), ["a", "tool", "b", "c"])
        XCTAssertEqual(message.content, "answer continued")
        message.canonicalHistory = [["role": AnyCodable("tool"), "content": AnyCodable("result")]]
        let decoded = try JSONDecoder().decode(ChatMessage.self, from: JSONEncoder().encode(message))
        XCTAssertEqual(decoded, message)
        let numbers = ["startLine": AnyCodable(NSNumber(value: 1)), "literal": AnyCodable(true)]
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(numbers)) as! [String: Any]
        XCTAssertEqual(String(describing: object["startLine"]!), "1")
        XCTAssertEqual(object["literal"] as? Bool, true)
    }

    func testNDJSONDecoding() throws {
        XCTAssertEqual(try SupercodeAPIClient.decodeEvent(#"{"type":"status","message":"waiting"}"#), .status("waiting"))
        XCTAssertEqual(try SupercodeAPIClient.decodeEvent(#"{"type":"reasoning","content":"analysis"}"#), .reasoning("analysis"))
        for key in ["args", "arguments"] {
            let line = "{\"type\":\"tool-call\",\"toolName\":\"exa_search\",\"toolCallId\":\"id\",\"\(key)\":{\"query\":\"Swift\"}}"
            guard case .toolCall(let id, let name, let args) = try SupercodeAPIClient.decodeEvent(line) else { return XCTFail("Expected tool") }
            XCTAssertEqual(id, "id")
            XCTAssertEqual(name, "exa_search")
            XCTAssertEqual(args["query"]?.stringValue, "Swift")
        }
        XCTAssertThrowsError(try SupercodeAPIClient.decodeEvent(#"{"type":"tool-call","arguments":"{"}"#))
        XCTAssertNil(try SupercodeAPIClient.decodeEvent(" "))
    }

    @MainActor
    func testLiteralSearchAndInvalidRegex() async throws {
        let root = try workspace()
        try "a.b\naxb".write(to: root.appendingPathComponent("a.txt"), atomically: true, encoding: .utf8)
        let result = await LocalToolRuntime.execute(name: "search_files", args: ["pattern": "a.b", "literal": true], workspaceRoot: root.path, mode: .chat)
        XCTAssertTrue(result.success, result.json)
        let object = try JSONSerialization.jsonObject(with: Data(result.json.utf8)) as! [String: Any]
        XCTAssertEqual((object["data"] as? [String: Any])?["total"] as? Int, 1)
        let invalid = await LocalToolRuntime.execute(name: "search_files", args: ["pattern": "["], workspaceRoot: root.path, mode: .chat)
        XCTAssertFalse(invalid.success)
    }

    @MainActor
    func testTurnCancellationAndBudget() async throws {
        let task = Task {
            try await NativeTurnEngine.run(history: [], context: .init(root: nil, mode: .chat, provider: "test", model: nil), stream: { _, _, _, _ in
                try await Task.sleep(for: .seconds(20))
            }, activity: { _ in }, resultHandler: { _, _ in })
        }
        try await Task.sleep(for: .milliseconds(20))
        task.cancel()
        do { _ = try await task.value; XCTFail("Expected cancellation") } catch is CancellationError {} catch { XCTFail("\(error)") }
        let outcome = try await NativeTurnEngine.run(history: [], context: .init(root: nil, mode: .chat, provider: "test", model: nil), budget: 1, stream: { _, _, _, event in
            await event(.toolCall(id: "id", name: "exa_search", args: [:]))
        }, activity: { _ in }, resultHandler: { _, _ in })
        XCTAssertTrue(outcome.text.contains("1-step budget"))
    }

    func testReferences() async throws {
        XCTAssertEqual(NativeFileReferences.mentions("Read @a.swift and @a.swift then @\"my file.txt\""), ["a.swift", "my file.txt"])
        let root = try workspace()
        try "test".write(to: root.appendingPathComponent("a.swift"), atomically: true, encoding: .utf8)
        let path = try await NativeFileReferences.lookup("a.swift", root: root.path)
        XCTAssertEqual(path, "a.swift")
    }

    @MainActor
    func testTurnHistoryRepetitionAndIDs() async throws {
        var calls = 0
        var parts: [MessagePart] = []
        let result = try await NativeTurnEngine.run(history: [["role": "user", "content": "test"]], context: .init(root: nil, mode: .chat, provider: "test", model: nil), stream: { history, _, _, event in
            calls += 1
            if calls > 1 { XCTAssertEqual(history.last?["role"] as? String, "tool") }
            await event(.toolCall(id: "same", name: "exa_search", args: [:]))
        }, activity: { parts.append($0) }, resultHandler: { _, _ in })
        XCTAssertEqual(calls, 3)
        XCTAssertTrue(result.text.contains("repeated"))
        let ids = parts.compactMap { part -> String? in
            if case .toolCall(let tool) = part, tool.status == .queued { return tool.id }; return nil
        }
        XCTAssertEqual(Set(ids).count, 3)
        XCTAssertEqual(result.history.filter { $0["role"] as? String == "tool" }.count, 3)
    }

    @MainActor
    func testDeniedModeAndQuestion() async throws {
        var statuses: [ToolCallStatus] = []
        let denied = try await NativeTurnEngine.run(history: [], context: .init(root: nil, mode: .plan, provider: "test", model: nil), stream: { _, _, _, event in
            await event(.toolCall(id: "id", name: "run_command", args: ["command": AnyCodable("pwd")]))
        }, activity: { if case .toolCall(let tool) = $0 { statuses.append(tool.status) } }, resultHandler: { _, _ in })
        XCTAssertEqual(statuses.last, .denied)
        XCTAssertTrue(denied.text.contains("Permission denied"))
        let question = try await NativeTurnEngine.run(history: [], context: .init(root: nil, mode: .chat, provider: "test", model: nil), stream: { _, _, _, event in
            await event(.toolCall(id: "id", name: "question", args: ["questions": AnyCodable([["question": "Which?", "header": "Choice", "options": [["label": "A"], ["label": "B"]]]])]))
        }, activity: { _ in }, resultHandler: { _, _ in })
        XCTAssertTrue(question.text.contains("Which?"))
        XCTAssertTrue(question.text.contains("- A"))
    }

    @MainActor
    func testDelegatedIsolationAndReadOnlyInheritance() async throws {
        var parentCalls = 0
        var childSeen = false
        _ = try await NativeTurnEngine.run(history: [["role": "user", "content": "parent-secret-context"]], context: .init(root: nil, mode: .plan, provider: "test", model: nil), stream: { history, context, tools, event in
            if history.contains(where: { $0["content"] as? String == "child task" }) {
                childSeen = true
                XCTAssertFalse(history.contains { $0["content"] as? String == "parent-secret-context" })
                XCTAssertEqual(context.mode, .chat)
                let names = tools.compactMap { ($0["function"] as? [String: Any])?["name"] as? String }
                XCTAssertFalse(names.contains("delegate"))
                XCTAssertFalse(names.contains("write_file"))
                await event(.text("child result"))
            } else {
                parentCalls += 1
                if parentCalls == 1 { await event(.toolCall(id: "id", name: "delegate", args: ["task": AnyCodable("child task"), "agent": AnyCodable("general")])) }
                else { await event(.text("parent result")) }
            }
        }, activity: { _ in }, resultHandler: { _, _ in })
        XCTAssertTrue(childSeen)
        XCTAssertEqual(parentCalls, 2)
    }
}
