/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

@preconcurrency import Foundation
import AppKit
import Combine
import Defaults
import Network

// MARK: - Lunar Display Data Model

/// Matches the JSON structure streamed by Lunar's socket listener.
struct LunarDisplayData: Codable {
    var brightness: Float?
    var contrast: Float?
    var volume: Float?
    var mute: Bool?
    var nits: Float?
    var display: Int
}

// MARK: - Lunar Control Category

enum LunarControlCategory {
    case brightness
    case contrast
    case volume
}

// MARK: - Lunar Manager

/// Manages integration with the Lunar app (fyi.lunar.Lunar).
///
/// Responsibilities:
/// - Detect whether Lunar is installed and running
/// - Observe app launch / termination to connect / disconnect automatically
/// - Connect to Lunar's TCP socket on localhost:23803 and listen for DDC changes
/// - Route brightness / contrast / volume events to Atoll's HUD pipeline
@MainActor
final class LunarManager: ObservableObject {
    static let shared = LunarManager()

    /// Bundle identifier of the Lunar app.
    nonisolated static let bundleID = "fyi.lunar.Lunar"

    /// UserDefaults suite used by Lunar to store its API key.
    private static let lunarDomain = "fyi.lunar.Lunar"
    private static let apiKeyKey = "apiKey"

    // MARK: Published state

    /// Whether Lunar is currently detected (installed) on this machine.
    @Published private(set) var isDetected: Bool = false

    /// Whether Lunar is currently running.
    @Published private(set) var isRunning: Bool = false

    /// Whether the TCP socket connection to Lunar is active.
    @Published private(set) var isConnected: Bool = false

    // MARK: Private

    private var connection: NWConnection?
    private var workspaceLaunchObserver: NSObjectProtocol?
    private var workspaceTermObserver: NSObjectProtocol?
    private var cancellables = Set<AnyCancellable>()
    private weak var coordinator: JarvisCoordinator?

    /// Reconnection back-off state.
    private var reconnectTask: Task<Void, Never>?
    private var reconnectAttempts: Int = 0
    private static let maxReconnectAttempts = 5
    private static let baseReconnectDelay: UInt64 = 2_000_000_000 // 2 seconds

    private var isLunarIntegrationEnabled: Bool {
        Defaults[.enableThirdPartyDDCIntegration] && Defaults[.thirdPartyDDCProvider] == .lunar
    }

    private var isExternalVolumeListenerEnabled: Bool {
        isLunarIntegrationEnabled && Defaults[.enableExternalVolumeControlListener]
    }

    private init() {
        isDetected = Self.checkInstallation()
        isRunning = Self.checkRunning()
        setupWorkspaceObservers()
        setupSettingsObserver()
    }

    // MARK: - Public API

    /// Configure with the view coordinator for HUD dispatch.
    func configure(coordinator: JarvisCoordinator) {
        self.coordinator = coordinator
        refreshConnectionState()
    }

    /// Called when Atoll is about to quit so Lunar's native OSD is restored.
    func appWillTerminate() {
        setLunarHideOSD(false)
    }

    /// Refresh detection status (e.g. after manual check from Settings).
    func refreshDetectionStatus() {
        let wasRunning = isRunning
        isDetected = Self.checkInstallation()
        isRunning = Self.checkRunning()
        if wasRunning != isRunning {
            NSLog("🌙 Lunar running state changed: running=\(isRunning)")
        }
        refreshConnectionState()
    }

    // MARK: - Detection

    /// Check if Lunar is installed by looking for its bundle ID.
    nonisolated static func checkInstallation() -> Bool {
        if NSWorkspace.shared.runningApplications.contains(where: { $0.bundleIdentifier == bundleID }) {
            return true
        }
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleID) {
            return FileManager.default.fileExists(atPath: url.path)
        }
        return false
    }

    /// Check if Lunar is currently running.
    nonisolated static func checkRunning() -> Bool {
        NSWorkspace.shared.runningApplications.contains(where: { $0.bundleIdentifier == bundleID })
    }

    // MARK: - Socket Connection

    private func connectToLunar() {
        guard connection == nil else { return }
        guard let apiKey = Self.retrieveAPIKey() else {
            NSLog("⚠️ Lunar: failed to retrieve API key from UserDefaults suite '\(Self.lunarDomain)'")
            return
        }

        setLunarHideOSD(true)

        let host = NWEndpoint.Host("localhost")
        let port = NWEndpoint.Port(23803)
        let conn = NWConnection(host: host, port: port, using: .tcp)

        conn.stateUpdateHandler = { [weak self] state in
            Task { @MainActor in
                self?.handleConnectionState(state, apiKey: apiKey)
            }
        }

        connection = conn
        conn.start(queue: DispatchQueue.global(qos: .utility))
        NSLog("🌙 Lunar: connecting to socket on \(host):\(port)…")
    }

    private func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        reconnectAttempts = 0

        if let conn = connection {
            conn.stateUpdateHandler = nil
            conn.cancel()
            connection = nil
        }
        isConnected = false
        setLunarHideOSD(false)
        NSLog("⏹ Lunar: socket disconnected")
    }

    private func handleConnectionState(_ state: NWConnection.State, apiKey: String) {
        switch state {
        case .ready:
            isConnected = true
            reconnectAttempts = 0
            NSLog("🌙 Lunar: connected to socket")
            sendListenCommand(apiKey: apiKey)
            receiveMessages()

        case .failed(let error):
            NSLog("🌙 Lunar: connection failed — \(error.localizedDescription)")
            isConnected = false
            connection?.cancel()
            connection = nil
            scheduleReconnect()

        case .cancelled:
            isConnected = false

        case .waiting(let error):
            NSLog("🌙 Lunar: connection waiting — \(error.localizedDescription)")

        default:
            break
        }
    }

    /// Send Lunar's listen command with the API key.
    private func sendListenCommand(apiKey: String) {
        guard let conn = connection else { return }

        let separator = String(UnicodeScalar(0x01))
        let message = [apiKey, "listen", "--json", "--only-user-adjustments"]
            .joined(separator: separator)

        guard let data = message.data(using: .utf8) else {
            NSLog("⚠️ Lunar: failed to encode listen command")
            return
        }

        conn.send(content: data, completion: .contentProcessed { error in
            if let error {
                NSLog("⚠️ Lunar: failed to send listen command — \(error.localizedDescription)")
            } else {
                NSLog("🌙 Lunar: listen command sent")
            }
        })
    }

    /// Receive JSON messages from Lunar's socket in a loop.
    private func receiveMessages() {
        guard let conn = connection else { return }

        conn.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
            if let data, !data.isEmpty {
                Task { @MainActor in
                    self?.handleReceivedData(data)
                }
            }

            if isComplete {
                NSLog("🌙 Lunar: stream ended")
                Task { @MainActor in
                    self?.isConnected = false
                    self?.connection?.cancel()
                    self?.connection = nil
                    self?.scheduleReconnect()
                }
            } else if let error {
                NSLog("⚠️ Lunar: receive error — \(error.localizedDescription)")
                Task { @MainActor in
                    self?.isConnected = false
                    self?.connection?.cancel()
                    self?.connection = nil
                    self?.scheduleReconnect()
                }
            } else {
                // Continue reading
                Task { @MainActor in
                    self?.receiveMessages()
                }
            }
        }
    }

    private func handleReceivedData(_ data: Data) {
        guard isLunarIntegrationEnabled, isRunning else { return }

        do {
            let displayData = try JSONDecoder().decode(LunarDisplayData.self, from: data)
            logDecodedPayload(displayData, source: "socket")
            routeToHUD(displayData)
        } catch {
            // Lunar may send multi-line JSON or partial data; try splitting by newlines
            let rawString = String(data: data, encoding: .utf8) ?? ""
            let lines = rawString.components(separatedBy: .newlines).filter { !$0.isEmpty }
            for line in lines {
                guard let lineData = line.data(using: .utf8) else { continue }
                if let displayData = try? JSONDecoder().decode(LunarDisplayData.self, from: lineData) {
                    logDecodedPayload(displayData, source: "socket-line")
                    routeToHUD(displayData)
                }
            }
        }
    }

    // MARK: - HUD Routing

    private func routeToHUD(_ data: LunarDisplayData) {
        let targetScreen = resolveScreen(for: data.display)
        let isExternal = isExternalDisplay(data.display, resolvedScreen: targetScreen)
        let hasVolumeData = data.volume != nil || data.mute != nil
        let externalVolumeListenerEnabled = isExternalVolumeListenerEnabled
        let resolvedScreenText = targetScreen?.localizedName ?? "nil"
        let brightnessText = data.brightness.map { String($0) } ?? "nil"
        let contrastText = data.contrast.map { String($0) } ?? "nil"
        let volumeText = data.volume.map { String($0) } ?? "nil"
        let muteText = data.mute.map { String($0) } ?? "nil"

        NSLog(
            "🌙 Lunar routed payload: display=\(data.display) resolvedScreen=\(resolvedScreenText) isExternal=\(isExternal) brightness=\(brightnessText) contrast=\(contrastText) volume=\(volumeText) mute=\(muteText) hasVolumeData=\(hasVolumeData) externalVolumeListener=\(externalVolumeListenerEnabled)"
        )

        // Nits-only events are informational (no user-facing HUD needed).
        let hasActionableChange = data.brightness != nil || data.contrast != nil || data.volume != nil || data.mute != nil
        guard hasActionableChange else { return }

        // Brightness — values arrive in 0…1 range from Lunar
        if let brightness = data.brightness {
            let value = CGFloat(brightness)
            let icon = isExternal ? "display" : ""
            dispatchBrightnessHUD(value: value, icon: icon, onScreen: targetScreen)
        }

        // Contrast — show as brightness-style HUD with a contrast icon
        if let contrast = data.contrast {
            let value = CGFloat(contrast)
            dispatchBrightnessHUD(value: value, icon: "circle.righthalf.filled", onScreen: targetScreen)
        }

        // Volume
        if externalVolumeListenerEnabled {
            if let volume = data.volume {
                let value = CGFloat(volume)
                let isMuted = data.mute ?? false
                dispatchVolumeHUD(value: value, isMuted: isMuted, onScreen: targetScreen)
            } else if let mute = data.mute {
                // Mute toggle without a volume value
                dispatchVolumeHUD(value: mute ? 0 : 1, isMuted: mute, onScreen: targetScreen)
            }
        } else if hasVolumeData {
            NSLog("🌙 Lunar volume payload ignored because external volume listener is disabled")
        }
    }

    // MARK: - HUD Dispatch (mirrors BetterDisplayManager / SystemChangesObserver logic)

    private func dispatchVolumeHUD(value: CGFloat, isMuted: Bool, onScreen targetScreen: NSScreen? = nil) {
        if HUDSuppressionCoordinator.shared.shouldSuppressVolumeHUD { return }

        if Defaults[.enableCircularHUD] {
            CircularHUDWindowManager.shared.show(type: .volume, value: value, onScreen: targetScreen)
            return
        }
        if Defaults[.enableVerticalHUD] {
            VerticalHUDWindowManager.shared.show(type: .volume, value: value, icon: "", onScreen: targetScreen)
            return
        }
        if Defaults[.enableCustomOSD] && Defaults[.enableOSDVolume] {
            CustomOSDWindowManager.shared.showVolume(value: value, onScreen: targetScreen)
        }
        if Defaults[.enableSystemHUD] && !Defaults[.enableCustomOSD] && !Defaults[.enableVerticalHUD] && !Defaults[.enableCircularHUD] {
            coordinator?.toggleSneakPeek(
                status: true,
                type: .volume,
                value: value,
                icon: "",
                onScreen: targetScreen
            )
        }
    }

    private func dispatchBrightnessHUD(value: CGFloat, icon: String = "", onScreen targetScreen: NSScreen? = nil) {
        if Defaults[.enableCircularHUD] {
            CircularHUDWindowManager.shared.show(type: .brightness, value: value, icon: icon, onScreen: targetScreen)
            return
        }
        if Defaults[.enableVerticalHUD] {
            VerticalHUDWindowManager.shared.show(type: .brightness, value: value, icon: icon, onScreen: targetScreen)
            return
        }
        if Defaults[.enableCustomOSD] && Defaults[.enableOSDBrightness] {
            CustomOSDWindowManager.shared.showBrightness(value: value, icon: icon, onScreen: targetScreen)
        }
        if Defaults[.enableSystemHUD] && !Defaults[.enableCustomOSD] && !Defaults[.enableVerticalHUD] && !Defaults[.enableCircularHUD] {
            coordinator?.toggleSneakPeek(
                status: true,
                type: .brightness,
                value: value,
                icon: icon,
                onScreen: targetScreen
            )
        }
    }

    // MARK: - Helpers

    /// Retrieve the Lunar API key from its UserDefaults suite.
    nonisolated private static func retrieveAPIKey() -> String? {
        UserDefaults(suiteName: lunarDomain)?.string(forKey: apiKeyKey)
    }

    /// Resolve a Lunar display ID (CGDirectDisplayID) to the matching NSScreen.
    private func resolveScreen(for displayID: Int) -> NSScreen? {
        if let directDisplayID = UInt32(exactly: displayID),
           let matchedScreen = NSScreen.screens.first(where: { screenNumber(for: $0) == directDisplayID }) {
            return matchedScreen
        }

        // Fallback for integrations that send 1-based display indexes (e.g. 1, 2)
        if displayID > 0 {
            let index = displayID - 1
            if NSScreen.screens.indices.contains(index) {
                let fallback = NSScreen.screens[index]
                NSLog("🌙 Lunar: display=\(displayID) resolved via index fallback to '\(fallback.localizedName)'")
                return fallback
            }
        }

        NSLog("🌙 Lunar: unable to resolve display=\(displayID), HUD will show on all screens")
        return nil
    }

    /// Whether the given displayID refers to an external (non-built-in) display.
    private func isExternalDisplay(_ displayID: Int, resolvedScreen: NSScreen?) -> Bool {
        if let resolvedScreen,
           let resolvedDisplayID = screenNumber(for: resolvedScreen) {
            return CGDisplayIsBuiltin(resolvedDisplayID) == 0
        }
        if let displayIDValue = UInt32(exactly: displayID) {
            return CGDisplayIsBuiltin(displayIDValue) == 0
        }
        return false
    }

    private func screenNumber(for screen: NSScreen) -> UInt32? {
        guard let num = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
            return nil
        }
        return num.uint32Value
    }

    private func logDecodedPayload(_ data: LunarDisplayData, source: String) {
        let hasVolumeData = data.volume != nil || data.mute != nil
        let brightnessText = data.brightness.map { String($0) } ?? "nil"
        let contrastText = data.contrast.map { String($0) } ?? "nil"
        let volumeText = data.volume.map { String($0) } ?? "nil"
        let muteText = data.mute.map { String($0) } ?? "nil"
        NSLog(
            "🌙 Lunar decoded payload (\(source)): display=\(data.display) brightness=\(brightnessText) contrast=\(contrastText) volume=\(volumeText) mute=\(muteText) hasVolumeData=\(hasVolumeData)"
        )
    }

    // MARK: - Reconnection

    private func scheduleReconnect() {
        guard isLunarIntegrationEnabled, isRunning else { return }
        guard reconnectAttempts < Self.maxReconnectAttempts else {
            NSLog("🌙 Lunar: max reconnect attempts reached, giving up")
            return
        }

        reconnectTask?.cancel()
        let attempt = reconnectAttempts
        reconnectAttempts += 1

        let delay = Self.baseReconnectDelay * UInt64(1 << min(attempt, 3)) // exponential back-off, max 16s

        reconnectTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: delay)
            guard !Task.isCancelled, self.isRunning, self.isLunarIntegrationEnabled else { return }
            NSLog("🌙 Lunar: reconnect attempt \(attempt + 1)/\(Self.maxReconnectAttempts)")
            self.connectToLunar()
        }
    }

    // MARK: - Workspace Observers (detect Lunar launch / quit)

    private func setupWorkspaceObservers() {
        let lunarBundleID = Self.bundleID

        workspaceLaunchObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didLaunchApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == lunarBundleID
            else { return }
            Task { @MainActor in
                NSLog("🟢 Lunar launched (pid: \(app.processIdentifier))")
                self?.isDetected = true
                self?.isRunning = true
                self?.reconnectAttempts = 0
                if self?.isLunarIntegrationEnabled == true {
                    // Give Lunar a moment to start its socket server
                    try? await Task.sleep(nanoseconds: 1_500_000_000)
                    self?.connectToLunar()
                }
            }
        }

        workspaceTermObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didTerminateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                  app.bundleIdentifier == lunarBundleID
            else { return }
            Task { @MainActor in
                NSLog("🔴 Lunar terminated (pid: \(app.processIdentifier))")
                self?.isRunning = false
                self?.disconnect()
            }
        }
    }

    // MARK: - Settings Observer

    private func refreshConnectionState() {
        if isLunarIntegrationEnabled && isRunning {
            connectToLunar()
        } else {
            disconnect()
        }
    }

    private func setupSettingsObserver() {
        Defaults.publisher(.enableThirdPartyDDCIntegration, options: [])
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.refreshConnectionState()
                }
            }
            .store(in: &cancellables)

        Defaults.publisher(.thirdPartyDDCProvider, options: [])
            .sink { [weak self] _ in
                Task { @MainActor in
                    self?.refreshConnectionState()
                }
            }
            .store(in: &cancellables)
    }

    deinit {
        // Restore Lunar's native OSD synchronously on teardown
        LunarManager.writeLunarDefault(hideOSD: false)
        connection?.cancel()
        reconnectTask?.cancel()
        if let workspaceLaunchObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(workspaceLaunchObserver)
        }
        if let workspaceTermObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(workspaceTermObserver)
        }
        cancellables.removeAll()
    }

    // MARK: - Lunar OSD Suppression

    /// Tell Lunar to hide (or show) its own native OSD by writing to its UserDefaults.
    private func setLunarHideOSD(_ hide: Bool) {
        Self.writeLunarDefault(hideOSD: hide)
    }

    /// Synchronous, nonisolated helper so it can also be called from `deinit`.
    nonisolated private static func writeLunarDefault(hideOSD hide: Bool) {
        guard let defaults = UserDefaults(suiteName: lunarDomain) else {
            NSLog("⚠️ Lunar: unable to open UserDefaults suite '\(lunarDomain)' to set hideOSD")
            return
        }
        defaults.set(hide, forKey: "hideOSD")
        NSLog("🌙 Lunar: hideOSD set to \(hide)")
    }
}
