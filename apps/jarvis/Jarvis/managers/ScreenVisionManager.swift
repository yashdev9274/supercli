import AppKit
import Combine
import CoreImage
import CoreMedia
import Foundation
import ScreenCaptureKit

/// Continuously captures the screen using ScreenCaptureKit so the voice AI
/// always has a fresh frame available to answer screen-related questions.
final class ScreenVisionManager: NSObject, ObservableObject {
    static let shared = ScreenVisionManager()

    @Published private(set) var isCapturing = false
    @Published private(set) var isAuthorized = false

    private var stream: SCStream?
    private var latestFrame: CGImage?
    private var latestFrameLock = NSLock()
    private let captureQueue = DispatchQueue(label: "screen.vision.capture", qos: .userInteractive)
    private let ciContext = CIContext()
    private var observers: [NSObjectProtocol] = []
    private var permissionRetryTimer: Timer?
    private var restartWorkItem: DispatchWorkItem?
    private var restartAttempt = 0
    /// Geometry of the active capture, used to crop frames to a selected region.
    /// `captureScale` maps screen points → capture pixels; `captureDisplayFrame`
    /// is the captured display's AppKit frame (bottom-left origin) and
    /// `captureDisplayID` identifies which display the stream is on.
    private var captureScale: CGFloat = 1
    private var captureDisplayFrame: CGRect = .zero
    private var captureDisplayID: CGDirectDisplayID = 0
    private var frameCount = 0

    private func logToFile(_ msg: String) {
        let line = "[ScreenVision] \(msg)\n"
        guard let data = line.data(using: .utf8) else { return }
        let url = URL(fileURLWithPath: "/tmp/jarvis_capture.log")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(data)
            try? h.close()
        } else {
            try? data.write(to: url)
        }
    }

    private override init() {
        super.init()
        installObservers()
    }

    /// Start continuous capture. Safe to call repeatedly; no-ops if already running.
    func startIfNeeded() {
        logToFile("startIfNeeded: capturing=\(isCapturing) enabled=\(VoiceConfig.screenVisionEnabled) authorized=\(CGPreflightScreenCaptureAccess())")
        guard !isCapturing, VoiceConfig.screenVisionEnabled else { return }

        if CGPreflightScreenCaptureAccess() {
            setAuthorized(true)
            Task { await startCapture() }
        } else {
            setAuthorized(false)
            print("[ScreenVision] Screen Recording permission not granted — waiting for grant")
            startPermissionRetryTimer()
        }
    }

    /// Request Screen Recording permission. Call from the main thread once.
    /// `CGRequestScreenCaptureAccess()` returns before the user answers the
    /// system prompt, so its return value is not trusted; the retry timer and
    /// foreground observers pick up the grant when it actually lands.
    func requestPermission() {
        guard !CGPreflightScreenCaptureAccess() else { return }
        _ = CGRequestScreenCaptureAccess()
        startPermissionRetryTimer()
    }

    func stop() {
        stopPermissionRetryTimer()
        restartWorkItem?.cancel()
        restartWorkItem = nil
        stream?.stopCapture()
        stream = nil
        latestFrame = nil
        captureScale = 1
        captureDisplayFrame = .zero
        captureDisplayID = 0
        setCapturing(false)
    }

    /// The most recent raw frame, for cropping by ScreenSelectionManager.
    var latestFrameImage: CGImage? {
        latestFrameLock.lock()
        defer { latestFrameLock.unlock() }
        return latestFrame
    }

    /// The captured frame cropped to a user-selected region (AppKit global
    /// coordinates, bottom-left origin) and encoded as a JPEG data URL.
    /// Returns nil when there is no frame yet or the selection is not on the
    /// captured display (callers fall back to the full frame).
    func croppedScreenImageDataURL(
        rect: CGRect,
        displayID: CGDirectDisplayID,
        maxDimension: CGFloat = 1280,
        quality: CGFloat = 0.6
    ) -> String? {
        latestFrameLock.lock()
        let frame = latestFrame
        latestFrameLock.unlock()
        guard let frame,
              displayID == captureDisplayID,
              captureScale > 0,
              !captureDisplayFrame.isEmpty
        else { return nil }

        let clamped = rect.intersection(captureDisplayFrame)
        guard clamped.width >= 1, clamped.height >= 1 else { return nil }

        // Points → pixels. The captured image's y axis grows downward while
        // AppKit's grows upward, so the vertical offset flips.
        let scale = captureScale
        let cropRect = CGRect(
            x: (clamped.minX - captureDisplayFrame.minX) * scale,
            y: (captureDisplayFrame.maxY - clamped.maxY) * scale,
            width: clamped.width * scale,
            height: clamped.height * scale
        ).integral

        guard let cropped = frame.cropping(to: cropRect) else { return nil }
        let scaled = scaleImage(cropped, maxDimension: maxDimension)
        let rep = NSBitmapImageRep(cgImage: scaled)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else { return nil }

        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    /// The most recent frame, downscaled to `maxDimension` (longest edge) and
    /// encoded as a JPEG data URL. Returns nil if no frame is available yet.
    func latestScreenImageDataURL(maxDimension: CGFloat = 1280, quality: CGFloat = 0.6) -> String? {
        latestFrameLock.lock()
        let frame = latestFrame
        latestFrameLock.unlock()
        guard let frame else { return nil }

        let scaled = scaleImage(frame, maxDimension: maxDimension)
        let rep = NSBitmapImageRep(cgImage: scaled)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: quality])
        else { return nil }

        return "data:image/jpeg;base64,\(data.base64EncodedString())"
    }

    // MARK: - Capture

    private func startCapture() async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            logToFile("displays: \(content.displays.map { "\($0.displayID):\($0.width)x\($0.height)" }.joined(separator: ", "))")
            guard let display = content.displays.first else {
                print("[ScreenVision] No display available")
                scheduleRestart()
                return
            }

            let filter = SCContentFilter(display: display, excludingWindows: [])

            // Downscale the capture resolution so we don't encode 5K frames at 5fps.
            let config = SCStreamConfiguration()
            let maxEdge: CGFloat = 1440
            let scale = min(maxEdge / CGFloat(display.width), maxEdge / CGFloat(display.height), 1.0)
            config.width = Int(CGFloat(display.width) * scale)
            config.height = Int(CGFloat(display.height) * scale)
            config.minimumFrameInterval = CMTime(value: 1, timescale: 5) // ~5 fps
            config.queueDepth = 3
            config.showsCursor = true
            config.capturesAudio = false

            let stream = SCStream(filter: filter, configuration: config, delegate: self)
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: captureQueue)

            try await stream.startCapture()
            self.stream = stream
            restartAttempt = 0
            stopPermissionRetryTimer()
            logToFile("stream started: display \(display.displayID) \(display.width)x\(display.height) config \(config.width)x\(config.height)")
            captureDisplayID = display.displayID
            captureDisplayFrame =
                NSScreen.screens.first {
                    ($0.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID) == display.displayID
                }?.frame ?? .zero
            captureScale = captureDisplayFrame.width > 0 ? CGFloat(config.width) / captureDisplayFrame.width : 1
            setCapturing(true)
            print("[ScreenVision] Capture started on \(display.width)x\(display.height)")
        } catch {
            logToFile("start failed: \(error)")
            print("[ScreenVision] Failed to start capture: \(error)")
            scheduleRestart()
        }
    }

    /// Restart the stream after a failure with exponential backoff (1s → 16s).
    /// If Screen Recording access is missing, hands off to the permission
    /// retry timer instead so we never hot-loop on a revoked permission.
    private func scheduleRestart() {
        guard VoiceConfig.screenVisionEnabled else { return }

        guard CGPreflightScreenCaptureAccess() else {
            setAuthorized(false)
            startPermissionRetryTimer()
            return
        }

        restartWorkItem?.cancel()
        let delay = min(pow(2.0, Double(restartAttempt)), 16.0)
        restartAttempt += 1
        let item = DispatchWorkItem { [weak self] in
            guard let self,
                  !self.isCapturing,
                  self.stream == nil,
                  VoiceConfig.screenVisionEnabled
            else { return }
            Task { await self.startCapture() }
        }
        restartWorkItem = item
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
    }

    private func scaleImage(_ image: CGImage, maxDimension: CGFloat) -> CGImage {
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        let longest = max(w, h)
        guard longest > maxDimension else { return image }

        let ratio = maxDimension / longest
        let target = CGSize(width: (w * ratio).rounded(), height: (h * ratio).rounded())
        guard let ctx = CGContext(
            data: nil,
            width: Int(target.width),
            height: Int(target.height),
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return image }

        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(origin: .zero, size: target))
        return ctx.makeImage() ?? image
    }

    /// Polls for the Screen Recording grant while the stream isn't running.
    /// TCC grants sometimes take a moment to register (and may need the app
    /// to refocus), so a periodic preflight check is the reliable fallback.
    private func startPermissionRetryTimer() {
        stopPermissionRetryTimer()
        let timer = Timer(timeInterval: 3.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            guard !self.isCapturing, self.stream == nil, VoiceConfig.screenVisionEnabled else {
                self.stopPermissionRetryTimer()
                return
            }
            if CGPreflightScreenCaptureAccess() {
                print("[ScreenVision] Screen Recording permission granted — starting capture")
                self.setAuthorized(true)
                self.stopPermissionRetryTimer()
                Task { await self.startCapture() }
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        permissionRetryTimer = timer
    }

    private func stopPermissionRetryTimer() {
        permissionRetryTimer?.invalidate()
        permissionRetryTimer = nil
    }

    private func installObservers() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
                // The user may have just granted Screen Recording in System Settings.
                self?.startIfNeeded()
            },
            center.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
                guard let self, self.isCapturing else { return }
                // Display layout changed — recreate the stream on the new primary display.
                self.restartWorkItem?.cancel()
                self.stream?.stopCapture()
                self.stream = nil
                self.setCapturing(false)
                Task { await self.startCapture() }
            },
        ]
    }

    private func setCapturing(_ value: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isCapturing = value
        }
    }

    private func setAuthorized(_ value: Bool) {
        DispatchQueue.main.async { [weak self] in
            self?.isAuthorized = value
        }
    }
}

extension ScreenVisionManager: SCStreamOutput {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen,
              let imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
        else { return }

        let ciImage = CIImage(cvImageBuffer: imageBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }

        frameCount += 1
        if frameCount <= 3 || frameCount % 60 == 0 {
            let rep = NSBitmapImageRep(cgImage: cgImage)
            let jpegBytes = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.6])?.count ?? -1
            logToFile(
                "frame #\(frameCount): pixelBuffer \(CVPixelBufferGetWidth(imageBuffer))x\(CVPixelBufferGetHeight(imageBuffer)) " +
                "format \(CVPixelBufferGetPixelFormatType(imageBuffer)) cgImage \(cgImage.width)x\(cgImage.height) jpeg=\(jpegBytes)B"
            )
        }

        latestFrameLock.lock()
        latestFrame = cgImage
        latestFrameLock.unlock()
    }
}

extension ScreenVisionManager: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[ScreenVision] Stream stopped: \(error)")
        self.stream = nil
        latestFrame = nil
        setCapturing(false)
        scheduleRestart()
    }
}
