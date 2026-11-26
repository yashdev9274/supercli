import AppKit
import Foundation

/// Signs the island into the CLI server with the same device-code flow
/// `supercode login` uses, then stores the session token Nova's voice route
/// accepts. The user approves the code in a browser once.
@MainActor
final class NovaSignIn: ObservableObject {
    static let shared = NovaSignIn()

    @Published var userCode: String = ""
    @Published var status: String = ""
    @Published var signingIn = false

    private let clientId = "jarvis-island"
    private var pollTask: Task<Void, Never>?

    private init() {}

    func start() {
        guard !signingIn else { return }
        signingIn = true
        status = "Requesting a code…"
        pollTask = Task { await run() }
    }

    func cancel() {
        pollTask?.cancel()
        pollTask = nil
        signingIn = false
        userCode = ""
        status = ""
    }

    private func run() async {
        guard let code = await requestCode() else {
            status = "Could not reach the voice server."
            signingIn = false
            return
        }
        userCode = code.userCode
        status = "Approve this code in your browser."
        if let url = URL(string: code.verificationURL) {
            NSWorkspace.shared.open(url)
        }
        let interval = max(code.interval, 5)
        while !Task.isCancelled {
            try? await Task.sleep(nanoseconds: UInt64(interval) * 1_000_000_000)
            if Task.isCancelled { return }
            switch await poll(deviceCode: code.deviceCode) {
            case .approved(let token):
                VoiceConfig.configure(authToken: token)
                status = "Signed in."
                signingIn = false
                return
            case .pending:
                continue
            case .failed(let message):
                status = message
                signingIn = false
                return
            }
        }
    }

    private struct DeviceCode {
        let deviceCode: String
        let userCode: String
        let verificationURL: String
        let interval: Int
    }

    private func requestCode() async -> DeviceCode? {
        guard
            let url = URL(string: "\(VoiceConfig.serverURL)/api/auth/device/code"),
            let body = try? JSONSerialization.data(withJSONObject: ["client_id": clientId])
        else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        guard
            let (data, response) = try? await URLSession.shared.data(for: request),
            (response as? HTTPURLResponse)?.statusCode == 200,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let deviceCode = json["device_code"] as? String,
            let userCode = json["user_code"] as? String
        else { return nil }
        let verification = (json["verification_uri_complete"] as? String) ?? (json["verification_uri"] as? String) ?? ""
        return DeviceCode(deviceCode: deviceCode, userCode: userCode, verificationURL: verification, interval: json["interval"] as? Int ?? 5)
    }

    private enum Poll { case pending, approved(String), failed(String) }

    private func poll(deviceCode: String) async -> Poll {
        guard
            let url = URL(string: "\(VoiceConfig.serverURL)/api/auth/device/token"),
            let body = try? JSONSerialization.data(withJSONObject: [
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": deviceCode,
                "client_id": clientId,
            ])
        else { return .failed("Could not reach the voice server.") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        guard let (data, response) = try? await URLSession.shared.data(for: request) else {
            return .failed("Could not reach the voice server.")
        }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        if (response as? HTTPURLResponse)?.statusCode == 200, let token = json?["access_token"] as? String {
            return .approved(token)
        }
        let error = (json?["error"] as? String) ?? ""
        if error == "authorization_pending" || error == "slow_down" { return .pending }
        return .failed(error == "access_denied" ? "Sign-in was declined." : "Sign-in expired. Try again.")
    }
}
