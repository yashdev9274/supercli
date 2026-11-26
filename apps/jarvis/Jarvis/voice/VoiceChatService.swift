import Foundation
import AppKit

class VoiceChatService {
    private let session = URLSession.shared
    private let serverURL: String

    init(serverURL: String = VoiceConfig.serverURL) {
        self.serverURL = serverURL
    }

    /// Send a voice message to the server. When `enableTools` is true, the server
    /// will auto-search the web when it doesn't know the answer.
    /// `history` carries the prior user/assistant turns so the agent can continue
    /// multi-step tasks (draft first, confirm, then send).
    func chat(transcript: String, history: [[String: String]] = [], enableTools: Bool = true) async throws -> VoiceChatResult {
        guard let url = URL(string: "\(serverURL)/api/voice/chat") else {
            throw ChatError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20

        var messages = history
        messages.append(["role": "user", "content": transcript])
        var body: [String: Any] = [
            "messages": messages,
            "provider": "concentrateai",
            "tools": enableTools
        ]
        if enableTools, await ComposioManager.shared.isConfigured {
            body["composioApiKey"] = await ComposioManager.shared.apiKey
            body["composioUserId"] = await ComposioManager.shared.userID
        }
        if VoiceConfig.screenVisionEnabled {
            // When the user has a Cmd+drag selection active, send the cropped
            // region instead of the full frame and flag it so the server tells
            // the model to focus on the selection only.
            if let selection = ScreenSelectionManager.shared.selection,
               let displayID = ScreenSelectionManager.shared.selectionDisplayID,
               let cropped = ScreenVisionManager.shared.croppedScreenImageDataURL(rect: selection, displayID: displayID) {
                body["screenImage"] = cropped
                body["screenSelection"] = true
            } else if let screenImage = ScreenVisionManager.shared.latestScreenImageDataURL() {
                body["screenImage"] = screenImage
            }
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            let bodyString = String(data: data, encoding: .utf8) ?? ""
            throw ChatError.serverError(statusCode: code, message: bodyString)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let reply = json["reply"] as? String ?? json["content"] as? String ?? json["text"] as? String else {
            throw ChatError.invalidResponse
        }

        let toolCalls: [VoiceToolCall] = (json["tools"] as? [[String: Any]])?.compactMap { dict -> VoiceToolCall? in
            guard let slug = dict["slug"] as? String else { return nil }
            return VoiceToolCall(
                slug: slug,
                toolkit: dict["toolkit"] as? String,
                app: dict["app"] as? String,
                status: dict["status"] as? String,
                summary: dict["summary"] as? String,
                arguments: VoiceToolCall.decodeArguments(dict["arguments"])
            )
        } ?? []

        return VoiceChatResult(reply: reply, tools: toolCalls)
    }

    func runWorkspaceLauncher() async -> String {
        let webTargets: [(name: String, url: String)] = [
            ("GitHub", "https://github.com/yashdev9274/supercli"),
            ("Slack", "https://supercodeai.slack.com"),
            ("Linear", "https://linear.app/supercodeai/projects/all"),
            ("X", "https://x.com"),
            ("Warp", "warp://action/new_tab?path=/Users/yashdewasthale/dev/saas/supercli")
        ]

        var results: [String] = []

        let whatsappApp = NSWorkspace.shared.launchApplication("WhatsApp")
        results.append(whatsappApp != nil ? "Opened WhatsApp" : "Failed to open WhatsApp")

        for target in webTargets {
            let result = await openInDia(target.url, name: target.name)
            results.append(result)
        }

        return results.joined(separator: ". ")
    }

    func openApp(_ appName: String) async -> String {
        let lower = appName.lowercased()
        let trimmed = appName.trimmingCharacters(in: .whitespacesAndNewlines)

        if lower == "whatsapp" {
            let app = NSWorkspace.shared.launchApplication("WhatsApp")
            return app != nil ? "Opened WhatsApp" : "Failed to open WhatsApp"
        }

        let appConfigs: [String: (name: String, url: String)] = [
            "github": ("GitHub", "https://github.com/yashdev9274/supercli"),
            "linear": ("Linear", "https://linear.app/supercodeai/projects/all"),
            "slack": ("Slack", "https://supercodeai.slack.com"),
            "twitter": ("X", "https://x.com/dewyashtwts"),
            "warp": ("Warp", "warp://action/new_tab?path=/Users/yashdewasthale/dev/saas/supercli"),
            "notion": ("Notion", "https://www.notion.so"),
            "figma": ("Figma", "https://www.figma.com"),
            "discord": ("Discord", "https://discord.com"),
        ]

        if let config = appConfigs[lower] {
            let result = await openInDia(config.url, name: config.name)
            return result
        }

        // Browser aliases → launch the specific browser app; a bare
        // "browser" opens the default browser at a start page.
        let browserApps: [String: String] = [
            "browser": "Safari",
            "web browser": "Safari",
            "safari": "Safari",
            "chrome": "Google Chrome",
            "google chrome": "Google Chrome",
            "arc": "Arc",
            "brave": "Brave Browser",
            "firefox": "Firefox",
            "edge": "Microsoft Edge",
        ]
        if let browserName = browserApps[lower] {
            if lower == "browser" || lower == "web browser" {
                NSWorkspace.shared.open(URL(string: "https://www.google.com")!)
                return "Opened browser"
            }
            let app = NSWorkspace.shared.launchApplication(browserName)
            return app != nil ? "Opened \(browserName)" : "Failed to open \(browserName)"
        }

        // Known sites → open in the default browser.
        let websiteURLs: [String: String] = [
            "youtube": "https://www.youtube.com",
            "google": "https://www.google.com",
            "gmail": "https://mail.google.com",
            "maps": "https://maps.google.com",
            "drive": "https://drive.google.com",
            "docs": "https://docs.google.com",
            "calendar": "https://calendar.google.com",
            "linkedin": "https://www.linkedin.com",
            "instagram": "https://www.instagram.com",
            "reddit": "https://www.reddit.com",
            "netflix": "https://www.netflix.com",
            "amazon": "https://www.amazon.com",
            "facebook": "https://www.facebook.com",
        ]
        if let siteURL = websiteURLs[lower] {
            NSWorkspace.shared.open(URL(string: siteURL)!)
            return "Opened \(appName) in browser"
        }

        // Domain-looking names (e.g. "example.com") → open in the default browser.
        if looksLikeWebsite(trimmed) {
            let target = trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"
            if let url = URL(string: target) {
                NSWorkspace.shared.open(url)
                return "Opened \(trimmed) in browser"
            }
        }

        // Generic fallback: launch any installed app by name (e.g. "spotify").
        let variants = [trimmed, trimmed.capitalized]
        var launched: Bool?
        for variant in variants where launched == nil {
            launched = NSWorkspace.shared.launchApplication(variant)
        }
        if launched != nil {
            return "Opened \(trimmed)"
        }

        return "Unknown app: \(appName)"
    }

    // MARK: - Open app in specific browser

    func openAppInBrowser(_ appName: String, browser: String) async -> String {
        let browserLower = browser.lowercased()
        let appLower = appName.lowercased()

        // Map browser names to application names
        let browserApps: [String: String] = [
            "chrome": "Google Chrome",
            "google chrome": "Google Chrome",
            "safari": "Safari",
            "arc": "Arc",
            "brave": "Brave Browser",
            "firefox": "Firefox",
            "edge": "Microsoft Edge",
        ]

        guard let browserAppName = browserApps[browserLower] else {
            return "Unknown browser: \(browser). Available: Chrome, Safari, Arc, Brave, Firefox, Edge"
        }

        // Map app names to URLs
        let websiteURLs: [String: String] = [
            "youtube": "https://www.youtube.com",
            "google": "https://www.google.com",
            "gmail": "https://mail.google.com",
            "github": "https://github.com",
            "twitter": "https://x.com",
            "x": "https://x.com",
            "linkedin": "https://www.linkedin.com",
            "reddit": "https://www.reddit.com",
            "netflix": "https://www.netflix.com",
            "amazon": "https://www.amazon.com",
            "facebook": "https://www.facebook.com",
            "instagram": "https://www.instagram.com",
            "notion": "https://www.notion.so",
            "figma": "https://www.figma.com",
            "linear": "https://linear.app",
            "slack": "https://slack.com",
            "discord": "https://discord.com",
        ]

        guard let urlString = websiteURLs[appLower] else {
            // Not a known website — try launching the app directly
            return await openApp(appName)
        }

        // Open the URL in the specified browser via AppleScript
        let script = """
        tell application "\(browserAppName)"
            activate
            open location "\(urlString)"
        end tell
        """

        var error: NSDictionary?
        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(&error)
            if let error = error {
                print("[VoiceChat] AppleScript error opening \(urlString) in \(browserAppName): \(error)")
                // Fallback: try launching the browser app directly
                let _ = NSWorkspace.shared.launchApplication(browserAppName)
                return "Opened \(browserAppName) (fallback)"
            }
            return "Opened \(appName) in \(browserAppName)"
        }

        return "Failed to open \(appName) in \(browserAppName)"
    }

    // MARK: - YouTube Music

    func openYouTubeMusic() async -> String {
        let app = NSWorkspace.shared.launchApplication("YouTube Music")
        if app != nil {
            return "Opened YouTube Music"
        }
        // Fallback: open in browser
        NSWorkspace.shared.open(URL(string: "https://music.youtube.com")!)
        return "Opened YouTube Music in browser"
    }

    // MARK: - WhatsApp message

    func sendWhatsAppMessage(to contact: String) async -> String {
        // Activate WhatsApp
        let _ = NSWorkspace.shared.launchApplication("WhatsApp")

        // Brief pause for WhatsApp to activate
        Thread.sleep(forTimeInterval: 0.5)

        // Open search via Cmd+F, type contact name
        let searchScript = """
        tell application "System Events"
            tell process "WhatsApp"
                set frontmost to true
                delay 0.3
                keystroke "f" using command down
                delay 0.3
                keystroke "\(contact)"
            end tell
        end tell
        """

        var error: NSDictionary?
        if let appleScript = NSAppleScript(source: searchScript) {
            appleScript.executeAndReturnError(&error)
            if let error = error {
                print("[VoiceChat] AppleScript error searching WhatsApp: \(error)")
                return "Opened WhatsApp (search for \(contact) failed)"
            }
        }

        return "Opened WhatsApp — select \(contact) from search results"
    }

    private func looksLikeWebsite(_ name: String) -> Bool {
        let lower = name.lowercased()
        if lower.hasPrefix("http://") || lower.hasPrefix("https://") || lower.hasPrefix("www.") {
            return true
        }
        guard lower.contains("."), !lower.contains(" ") else { return false }
        let knownTLDs = ["com", "org", "net", "io", "ai", "dev", "co", "app", "me", "tv", "gov", "edu", "in", "xyz"]
        return knownTLDs.contains { lower.hasSuffix(".\($0)") }
    }

    private func openTargets(_ targets: [(name: String, url: String)]) async -> String {
        var results: [String] = []

        for target in targets {
            let result = await openInDia(target.url, name: target.name)
            results.append(result)
        }

        return results.joined(separator: ". ")
    }

    private func openInDia(_ urlString: String, name: String) async -> String {
        guard let url = URL(string: urlString) else { return "Failed to open \(name)" }

        let diaBundleID = "com.electron.dia"

        let apps = NSWorkspace.shared.runningApplications.filter {
            $0.bundleIdentifier == diaBundleID
        }

        if let diaApp = apps.first {
            diaApp.activate()
            NSWorkspace.shared.open(url)
            return "Opened \(name)"
        } else {
            let config = NSWorkspace.OpenConfiguration()
            config.activates = true
            do {
                let app = try await NSWorkspace.shared.open(
                    [url],
                    withApplicationAt: URL(fileURLWithPath: "/Applications/Dia.app"),
                    configuration: config
                )
                return app != nil ? "Opened \(name)" : "Failed to open \(name)"
            } catch {
                return "Failed to open \(name): \(error.localizedDescription)"
            }
        }
    }
}

enum ChatError: LocalizedError {
    case invalidURL
    case serverError(statusCode: Int, message: String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid chat URL"
        case .serverError(let code, let msg): return "Chat error (\(code)): \(msg)"
        case .invalidResponse: return "Invalid response from chat server"
        }
    }
}

/// Metadata for a tool executed during a voice chat, returned by the server so
/// the Dynamic Island can render per-app activity.
struct VoiceToolCall: Codable, Hashable, Sendable {
    let slug: String
    let toolkit: String?
    let app: String?
    let status: String?
    let summary: String?
    /// The raw arguments the agent passed when executing the tool. Used to
    /// pre-fill the per-app compose panel (e.g. mail recipient/subject/body).
    let arguments: [String: ComposioJSONValue]?

    var isSuccess: Bool { status == "success" }
}

extension VoiceToolCall {
    /// Decodes the server's raw `arguments` dictionary into typed JSON values.
    /// Converts in place so bare strings / NSNull never hit
    /// `JSONSerialization.data(withJSONObject:)`, which raises an uncatchable
    /// NSException for non-dictionary top-level types.
    static func decodeArguments(_ raw: Any?) -> [String: ComposioJSONValue]? {
        guard let rawDict = raw as? [String: Any], !rawDict.isEmpty else { return nil }
        var result: [String: ComposioJSONValue] = [:]
        for (key, value) in rawDict {
            result[key] = jsonValue(from: value)
        }
        return result.isEmpty ? nil : result
    }

    private static func jsonValue(from value: Any) -> ComposioJSONValue {
        if value is NSNull { return .null }
        if let number = value as? NSNumber {
            // NSNumber also boxes booleans; must distinguish before doubleValue.
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return .bool(number.boolValue)
            }
            return .number(number.doubleValue)
        }
        if let string = value as? String { return .string(string) }
        if let array = value as? [Any] { return .array(array.map { jsonValue(from: $0) }) }
        if let dict = value as? [String: Any] {
            var object: [String: ComposioJSONValue] = [:]
            for (key, nested) in dict { object[key] = jsonValue(from: nested) }
            return .object(object)
        }
        return .null
    }
}

struct VoiceChatResult: Sendable {
    let reply: String
    let tools: [VoiceToolCall]
}
