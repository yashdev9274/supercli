import Darwin
import Foundation

private final class OpenCodeRunProcess: @unchecked Sendable {
    struct Result: Sendable {
        let status: Int32
        let stdout: Data
        let stderr: Data
    }

    private let lock = NSLock()
    private var process: Process?
    private var cancelled = false

    func run(executable: String, arguments: [String], input: Data, workspace: String?) throws -> Result {
        let process = Process()
        let stdin = Pipe()
        let stdout = Pipe()
        let stderr = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.currentDirectoryURL = URL(fileURLWithPath: workspace ?? FileManager.default.homeDirectoryForCurrentUser.path)
        var environment = ProcessInfo.processInfo.environment
        environment.removeValue(forKey: "OPENCODE_SERVER_USERNAME")
        environment.removeValue(forKey: "OPENCODE_SERVER_PASSWORD")
        environment.removeValue(forKey: "OPENCODE_CLIENT")
        environment["NO_COLOR"] = "1"
        process.environment = environment
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = stderr

        lock.lock()
        self.process = process
        let shouldCancel = cancelled
        lock.unlock()
        if shouldCancel { throw CancellationError() }

        do {
            try process.run()
        } catch {
            clear(process)
            throw error
        }
        if isCancelled { process.terminate() }
        stdin.fileHandleForWriting.write(input)
        try? stdin.fileHandleForWriting.close()

        let group = DispatchGroup()
        let output = LockedData()
        let errors = LockedData()
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            output.set(stdout.fileHandleForReading.readDataToEndOfFile())
            group.leave()
        }
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            errors.set(stderr.fileHandleForReading.readDataToEndOfFile())
            group.leave()
        }
        process.waitUntilExit()
        group.wait()
        clear(process)
        if isCancelled { throw CancellationError() }
        return Result(status: process.terminationStatus, stdout: output.value, stderr: errors.value)
    }

    func cancel() {
        lock.lock()
        cancelled = true
        let process = process
        lock.unlock()
        if process?.isRunning == true { process?.terminate() }
    }

    private var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }

    private func clear(_ process: Process) {
        lock.lock()
        if self.process === process { self.process = nil }
        lock.unlock()
    }
}

private final class LockedData: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()

    var value: Data {
        lock.lock()
        defer { lock.unlock() }
        return data
    }

    func set(_ data: Data) {
        lock.lock()
        self.data = data
        lock.unlock()
    }
}

enum OpenCodeError: LocalizedError {
    case notInstalled
    case unsupportedVersion(String)
    case startupFailed(String)
    case providerAuthenticationFailed(provider: String, message: String)
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notInstalled:
            return "OpenCode is not installed. Install OpenCode, connect a provider, then try again."
        case .unsupportedVersion(let version):
            return "OpenCode \(version) is not supported by this SuperCode build."
        case .startupFailed(let message):
            return "Could not start OpenCode: \(message)"
        case .providerAuthenticationFailed(let provider, let message):
            return "OpenCode could not authenticate \(provider): \(message) SuperCode does not read or send this provider credential. Verify the same model in OpenCode, then reconnect the provider with /connect if it also fails there."
        case .invalidResponse:
            return "OpenCode returned an invalid response."
        case .server(let message):
            return message
        }
    }
}

@MainActor
final class OpenCodeServiceManager {
    static let shared = OpenCodeServiceManager()

    private var process: Process?
    private var client: OpenCodeAPIClient?
    private var outputPipe: Pipe?

    private init() {}

    func ensureClient() async throws -> OpenCodeAPIClient {
        if let client, process?.isRunning == true {
            return client
        }

        stop()
        let executable = try Self.findExecutable()
        let version = try Self.readVersion(executable: executable)
        guard version.split(separator: ".").first == "1" else {
            throw OpenCodeError.unsupportedVersion(version)
        }

        let port = try Self.availablePort()
        let password = UUID().uuidString + UUID().uuidString
        let username = "supercode"
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = ["serve", "--hostname", "127.0.0.1", "--port", String(port)]
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        var environment = ProcessInfo.processInfo.environment
        environment["OPENCODE_SERVER_USERNAME"] = username
        environment["OPENCODE_SERVER_PASSWORD"] = password
        environment["NO_COLOR"] = "1"
        process.environment = environment
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { handle in
            _ = handle.availableData
        }

        do {
            try process.run()
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            throw OpenCodeError.startupFailed(error.localizedDescription)
        }

        self.process = process
        outputPipe = pipe
        let client = OpenCodeAPIClient(
            baseURL: URL(string: "http://127.0.0.1:\(port)")!,
            username: username,
            password: password,
            version: version,
            executable: executable
        )

        do {
            for _ in 0..<50 {
                if !process.isRunning {
                    throw OpenCodeError.startupFailed("The OpenCode process exited before becoming ready.")
                }
                if Self.isPortReady(port), await client.isHealthy() {
                    self.client = client
                    return client
                }
                try await Task.sleep(for: .milliseconds(100))
            }
            throw OpenCodeError.startupFailed("Timed out waiting for the local server.")
        } catch {
            stop()
            throw error
        }
    }

    func stop() {
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        outputPipe = nil
        client = nil
        guard let process else { return }
        self.process = nil
        if process.isRunning {
            process.terminate()
        }
    }

    private static func findExecutable() throws -> String {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            ProcessInfo.processInfo.environment["OPENCODE_BIN"],
            "\(home)/.opencode/bin/opencode",
            "/opt/homebrew/bin/opencode",
            "/usr/local/bin/opencode",
            "/usr/bin/opencode",
        ].compactMap { $0 }

        guard let path = candidates.first(where: FileManager.default.isExecutableFile(atPath:)) else {
            throw OpenCodeError.notInstalled
        }
        return path
    }

    private static func readVersion(executable: String) throws -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = ["--version"]
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw OpenCodeError.startupFailed("Could not read the installed version.")
        }
        return String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func availablePort() throws -> UInt16 {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { throw OpenCodeError.startupFailed("Could not allocate a local port.") }
        defer { close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = 0
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { throw OpenCodeError.startupFailed("Could not bind a local port.") }

        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let resolved = withUnsafeMutablePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(descriptor, $0, &length)
            }
        }
        guard resolved == 0 else { throw OpenCodeError.startupFailed("Could not resolve a local port.") }
        return UInt16(bigEndian: address.sin_port)
    }

    private static func isPortReady(_ port: UInt16) -> Bool {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { return false }
        defer { close(descriptor) }

        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr = in_addr(s_addr: inet_addr("127.0.0.1"))
        return withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
            }
        }
    }
}

actor OpenCodeAPIClient {
    let version: String

    private let baseURL: URL
    private let authorization: String
    private let executable: String
    private let session: URLSession

    init(baseURL: URL, username: String, password: String, version: String, executable: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.version = version
        self.executable = executable
        self.session = session
        authorization = "Basic " + Data("\(username):\(password)".utf8).base64EncodedString()
    }

    func isHealthy() async -> Bool {
        do {
            let object = try await request(method: "GET", path: "/global/health")
            return object["healthy"] as? Bool == true
        } catch {
            return false
        }
    }

    func models() async throws -> [OpenCodeModel] {
        let object = try await request(method: "GET", path: "/provider")
        return Self.parseModels(object)
    }

    nonisolated static func parseModels(_ object: [String: Any]) -> [OpenCodeModel] {
        let connected = Set(object["connected"] as? [String] ?? [])
        let providers = object["all"] as? [[String: Any]] ?? []

        return providers.compactMap { provider -> [OpenCodeModel]? in
            guard let providerID = provider["id"] as? String,
                  connected.contains(providerID),
                  let rawModels = provider["models"] as? [String: Any] else { return nil }
            let providerName = provider["name"] as? String ?? providerID
            return rawModels.compactMap { key, value in
                guard let model = value as? [String: Any] else { return nil }
                let status = model["status"] as? String ?? "active"
                let modelID = model["id"] as? String ?? key
                guard status == "active" else { return nil }
                let capabilities = model["capabilities"] as? [String: Any]
                let variants = (model["variants"] as? [String: Any])?.keys.sorted() ?? []
                return OpenCodeModel(
                    providerID: providerID,
                    providerName: providerName,
                    modelID: modelID,
                    name: model["name"] as? String ?? key,
                    supportsReasoning: capabilities?["reasoning"] as? Bool == true,
                    supportsTools: capabilities?["toolcall"] as? Bool == true,
                    variants: variants
                )
            }
        }
        .flatMap { $0 }
        .sorted {
            if $0.providerName == $1.providerName { return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            return $0.providerName.localizedCaseInsensitiveCompare($1.providerName) == .orderedAscending
        }
    }

    func generate(
        history: [[String: Any]],
        providerID: String,
        modelID: String,
        workspace: String?,
        agent: String = "build",
        onEvent: @escaping @Sendable (StreamEvent) async -> Void
    ) async throws {
        let runner = OpenCodeRunProcess()
        let prompt = Self.nativePrompt(history: history)
        let arguments = [
            "run",
            "--format", "json",
            "--thinking",
            "--model", "\(providerID)/\(modelID)",
            "--agent", agent,
            "--title", "SuperCode",
        ]
        let result = try await withTaskCancellationHandler {
            try await Task.detached(priority: .userInitiated) {
                try runner.run(
                    executable: self.executable,
                    arguments: arguments,
                    input: Data(prompt.utf8),
                    workspace: workspace
                )
            }.value
        } onCancel: {
            runner.cancel()
        }
        try Task.checkCancellation()

        let lines = String(decoding: result.stdout, as: UTF8.self).split(whereSeparator: \.isNewline)
        var emitted = false
        var reportedError: String?
        for line in lines {
            guard let event = Self.decodeRunEvent(String(line)) else { continue }
            switch event {
            case .text, .reasoning:
                emitted = true
                await onEvent(event)
            case .error(let message):
                reportedError = message
            case .finish(let reason, let usage):
                await onEvent(.finish(reason: reason, usage: usage))
            case .status, .toolCall:
                break
            }
        }

        let stderr = String(decoding: result.stderr, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        if let reportedError {
            throw Self.providerError(message: reportedError, providerID: providerID)
        }
        if result.status != 0 {
            let message = stderr.isEmpty ? "OpenCode exited with status \(result.status)." : stderr
            throw Self.providerError(message: message, providerID: providerID)
        }
        if !emitted {
            if !stderr.isEmpty { throw Self.providerError(message: stderr, providerID: providerID) }
            throw OpenCodeError.invalidResponse
        }
    }

    nonisolated static func nativePrompt(history: [[String: Any]]) -> String {
        history.compactMap { message -> String? in
            guard let role = message["role"] as? String else { return nil }
            if let content = message["content"] as? String {
                return "<\(role)>\n\(content)\n</\(role)>"
            }
            guard let data = try? JSONSerialization.data(withJSONObject: message, options: [.sortedKeys]),
                  let content = String(data: data, encoding: .utf8) else { return nil }
            return "<\(role)>\n\(content)\n</\(role)>"
        }.joined(separator: "\n\n")
    }

    nonisolated static func decodeRunEvent(_ line: String) -> StreamEvent? {
        guard let data = line.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = object["type"] as? String else { return nil }
        let part = object["part"] as? [String: Any]
        switch type {
        case "text":
            guard let text = part?["text"] as? String, !text.isEmpty else { return nil }
            return .text(text)
        case "reasoning":
            guard let text = part?["text"] as? String, !text.isEmpty else { return nil }
            return .reasoning(text)
        case "step_finish":
            let reason = part?["reason"] as? String
            let usage = (part?["tokens"] as? [String: Any])?.mapValues(AnyCodable.init)
            return .finish(reason: reason, usage: usage)
        case "error":
            return .error(errorMessage(object["error"] ?? object) ?? "The selected OpenCode model failed.")
        default:
            return nil
        }
    }

    private func request(
        method: String,
        path: String,
        body: [String: Any]? = nil,
        workspace: String? = nil
    ) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw OpenCodeError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue(authorization, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("SuperCode/0.1", forHTTPHeaderField: "User-Agent")
        if let workspace { request.setValue(workspace, forHTTPHeaderField: "x-opencode-directory") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw OpenCodeError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = Self.safeErrorMessage(data: data) ?? "OpenCode returned HTTP \(http.statusCode)."
            throw OpenCodeError.server(message)
        }
        if data.isEmpty { return [:] }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw OpenCodeError.invalidResponse
        }
        return object
    }

    private nonisolated static func safeErrorMessage(data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return errorMessage(object)
    }

    private nonisolated static func errorMessage(_ value: Any) -> String? {
        guard let object = value as? [String: Any] else { return value as? String }
        if let message = object["message"] as? String { return message }
        if let data = object["data"], let message = errorMessage(data) { return message }
        if let error = object["error"], let message = errorMessage(error) { return message }
        return nil
    }

    nonisolated static func providerError(message: String, providerID: String) -> OpenCodeError {
        if message.localizedCaseInsensitiveContains("invalid api key")
            || message.localizedCaseInsensitiveContains("authentication failed")
            || message.localizedCaseInsensitiveContains("unauthorized") {
            return .providerAuthenticationFailed(provider: providerID, message: message)
        }
        return .server(message)
    }
}

@MainActor
final class OpenCodeProfileStore: ObservableObject {
    static let shared = OpenCodeProfileStore()

    @Published private(set) var state: OpenCodeConnectionState = .idle
    @Published private(set) var models: [OpenCodeModel] = []

    private init() {}

    func refresh() async {
        state = .starting
        do {
            let client = try await OpenCodeServiceManager.shared.ensureClient()
            models = try await client.models()
            state = .connected(version: client.version)
        } catch {
            models = []
            state = .unavailable(error.localizedDescription)
        }
    }

    func stop() {
        models = []
        state = .idle
        OpenCodeServiceManager.shared.stop()
    }

    func models(providerID: String) -> [OpenCodeModel] {
        models.filter { $0.providerID == providerID }
    }

    var providers: [(id: String, name: String)] {
        var seen = Set<String>()
        return models.compactMap { model in
            guard seen.insert(model.providerID).inserted else { return nil }
            return (model.providerID, model.providerName)
        }
    }
}
