import Foundation
import Darwin

actor NativeCommandRunner {
    static let shared = NativeCommandRunner()

    func run(executable: String = "/bin/sh", arguments: [String], cwd: String, timeout: Int) async throws -> [String: Any] {
        try Task.checkCancellation()
        var out: [Int32] = [0, 0]
        var err: [Int32] = [0, 0]
        guard pipe(&out) == 0 else { throw NativeToolError("Cannot create output pipe") }
        guard pipe(&err) == 0 else {
            close(out[0]); close(out[1])
            throw NativeToolError("Cannot create error pipe")
        }
        defer { close(out[0]); close(err[0]) }
        var actions: posix_spawn_file_actions_t?
        var attributes: posix_spawnattr_t?
        posix_spawn_file_actions_init(&actions)
        posix_spawnattr_init(&attributes)
        defer { posix_spawn_file_actions_destroy(&actions); posix_spawnattr_destroy(&attributes) }
        posix_spawn_file_actions_addchdir_np(&actions, cwd)
        posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0)
        posix_spawn_file_actions_adddup2(&actions, out[1], STDOUT_FILENO)
        posix_spawn_file_actions_adddup2(&actions, err[1], STDERR_FILENO)
        for fd in out + err { posix_spawn_file_actions_addclose(&actions, fd) }
        posix_spawnattr_setflags(&attributes, Int16(POSIX_SPAWN_SETPGROUP | POSIX_SPAWN_CLOEXEC_DEFAULT))
        posix_spawnattr_setpgroup(&attributes, 0)
        let argv = ([executable] + arguments).map { strdup($0) } + [nil]
        let environment: [String] = [
            "PATH=\(ProcessInfo.processInfo.environment["PATH"] ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")",
            "HOME=\(NSHomeDirectory())", "TERM=dumb", "PAGER=cat", "GIT_TERMINAL_PROMPT=0",
            "SUPERCODE_WORKSPACE_ROOT=\(cwd)",
        ]
        let env = environment.map { strdup($0) } + [nil]
        defer { argv.forEach { free($0) }; env.forEach { free($0) } }
        var pid: pid_t = 0
        let spawnError = argv.withUnsafeBufferPointer { a in
            env.withUnsafeBufferPointer { e in
                posix_spawn(&pid, executable, &actions, &attributes, a.baseAddress!, e.baseAddress!)
            }
        }
        close(out[1]); close(err[1])
        guard spawnError == 0 else { throw NativeToolError("Cannot start command: \(String(cString: strerror(spawnError)))") }
        var reaped = false
        defer {
            kill(-pid, SIGKILL)
            if !reaped { var status: Int32 = 0; waitpid(pid, &status, 0) }
        }
        for fd in [out[0], err[0]] { _ = fcntl(fd, F_SETFL, O_NONBLOCK) }
        // Private bounded logs are retained for inspection; never stream unlimited output into the UI.
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("supercode-command-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let logURL = directory.appendingPathComponent("output.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
        let log = try FileHandle(forWritingTo: logURL)
        defer { try? log.close() }
        var stdout = Data(), stderr = Data()
        var total = 0, logged = 0
        let logLimit = 10_000_000, previewLimit = 60_000
        var scratch = [UInt8](repeating: 0, count: 8192)
        func drain(_ fd: Int32, into preview: inout Data) throws {
            // Bound work per tick even if a child writes continuously.
            for _ in 0..<32 {
                let n = read(fd, &scratch, scratch.count)
                if n <= 0 { break }
                let bytes = Data(scratch.prefix(n))
                total += n
                if preview.count < previewLimit { preview.append(bytes.prefix(previewLimit - preview.count)) }
                if logged < logLimit {
                    let portion = bytes.prefix(logLimit - logged)
                    try log.write(contentsOf: portion)
                    logged += portion.count
                }
            }
        }
        let deadline = Date().addingTimeInterval(Double(timeout) / 1000)
        var timedOut = false, cancelled = false
        var terminationStarted: Date?
        var status: Int32 = 0
        while true {
            try drain(out[0], into: &stdout)
            try drain(err[0], into: &stderr)
            if waitpid(pid, &status, WNOHANG) == pid { reaped = true; break }
            if terminationStarted == nil && (Task.isCancelled || Date() >= deadline) {
                cancelled = Task.isCancelled
                timedOut = !cancelled
                terminationStarted = Date()
                kill(-pid, SIGTERM)
            }
            if let start = terminationStarted, Date().timeIntervalSince(start) > 0.5 { kill(-pid, SIGKILL) }
            // Cancellation must still reap the child and drain its output.
            try? await Task.sleep(for: .milliseconds(15))
            if Task.isCancelled {
                await Task.detached { try? await Task.sleep(for: .milliseconds(15)) }.value
            }
        }
        kill(-pid, SIGKILL)
        try drain(out[0], into: &stdout)
        try drain(err[0], into: &stderr)
        let signal = status & 0x7f
        let exitCode = signal == 0 ? (status >> 8) & 0xff : -1
        let success = exitCode == 0 && !timedOut && !cancelled
        return [
            "stdout": String(decoding: stdout, as: UTF8.self), "stderr": String(decoding: stderr, as: UTF8.self),
            "exitCode": Int(exitCode), "signal": Int(signal), "timedOut": timedOut, "cancelled": cancelled,
            "success": success, "truncated": total > stdout.count + stderr.count,
            "logTruncated": total > logLimit, "logPath": logURL.path,
            "summary": cancelled ? "Command cancelled" : timedOut ? "Command timed out" : success ? "Command completed successfully" : "Command failed with exit code \(exitCode)",
        ]
    }
}
