import AppKit
import SwiftUI

struct ComputerControlApprovalRequest: Sendable {
    let action: String
    let target: String
    let safePreview: String
    let expiresAt: Date
}

enum ComputerControlApprovalDecision: Sendable, Equatable {
    case approved
    case denied
}

private final class ApprovalCancellation: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = false

    func cancel() {
        lock.lock()
        cancelled = true
        lock.unlock()
    }

    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }
}

@MainActor
struct ComputerControlApprovalView: View {
    let request: ComputerControlApprovalRequest
    let decide: (ComputerControlApprovalDecision) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                Image(systemName: "hand.raised.fill")
                    .foregroundStyle(.cyan)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Computer control request")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Review before allowing this action")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.55))
                }
                Spacer()
            }
            VStack(alignment: .leading, spacing: 10) {
                row("ACTION", request.action)
                row("APP / WINDOW", request.target)
                row("PREVIEW", request.safePreview)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 9))
            HStack {
                Text("Expires \(request.expiresAt.formatted(date: .abbreviated, time: .standard))")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Button("Deny") { decide(.denied) }
                    .keyboardShortcut(.cancelAction)
                Button("Approve") { decide(.approved) }
                    .tint(.cyan)
            }
            .buttonStyle(.bordered)
        }
        .padding(20)
        .frame(width: 390)
        .foregroundStyle(.white)
        .background(Color(red: 0.09, green: 0.10, blue: 0.12))
        .preferredColorScheme(.dark)
    }

    private func row(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.45))
            Text(value)
                .font(.system(size: 12))
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }
}

@MainActor
final class ComputerControlApproval: NSObject, NSWindowDelegate {
    private var window: NSWindow?
    private var continuation: CheckedContinuation<ComputerControlApprovalDecision, Never>?
    private var expiryTask: Task<Void, Never>?
    private var expiresAt: Date = .distantPast
    private var started = false
    private let cancellation = ApprovalCancellation()

    func requestDecision(for request: ComputerControlApprovalRequest) async -> ComputerControlApprovalDecision {
        guard !started else { return .denied }
        started = true
        guard !Task.isCancelled, request.expiresAt > Date() else { return .denied }
        expiresAt = request.expiresAt

        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                guard !Task.isCancelled, !cancellation.isCancelled, request.expiresAt > Date() else {
                    finish(.denied)
                    return
                }
                let view = ComputerControlApprovalView(request: request) { [weak self] decision in
                    self?.finish(decision)
                }
                let window = NSWindow(contentViewController: NSHostingController(rootView: view))
                window.styleMask = [.titled, .closable]
                window.title = "Approval required"
                window.isReleasedWhenClosed = false
                window.delegate = self
                window.center()
                self.window = window
                window.makeKeyAndOrderFront(nil)
                expiryTask = Task { [weak self] in
                    while !Task.isCancelled {
                        let remaining = request.expiresAt.timeIntervalSinceNow
                        if remaining <= 0 {
                            self?.finish(.denied)
                            return
                        }
                        try? await Task.sleep(nanoseconds: UInt64(min(remaining, 60) * 1_000_000_000))
                    }
                }
            }
        } onCancel: {
            self.cancellation.cancel()
            Task { @MainActor in self.finish(.denied) }
        }
    }

    func windowWillClose(_ notification: Notification) {
        finish(.denied)
    }

    private func finish(_ decision: ComputerControlApprovalDecision) {
        guard let continuation else { return }
        self.continuation = nil
        expiryTask?.cancel()
        expiryTask = nil
        window?.delegate = nil
        window?.close()
        window = nil
        continuation.resume(returning: decision == .approved && !cancellation.isCancelled && Date() < expiresAt ? .approved : .denied)
    }
}
