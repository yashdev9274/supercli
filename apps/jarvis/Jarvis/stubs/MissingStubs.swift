import AppKit
import Combine
import Defaults
import SwiftUI



// MARK: - ClipboardPanel stub

class ClipboardPanel: NSPanel {
    func positionNearNotch() {}
}

// MARK: - VisualEffectView

struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context _: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        view.isEmphasized = true
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context _: Context) {
        view.material = material
        view.blendingMode = blendingMode
    }
}

// MARK: - ShowLiveCanvasInDynamicIsland Defaults key

extension Defaults.Keys {
    static let showLiveCanvasInDynamicIsland = Key<Bool>("showLiveCanvasInDynamicIsland", default: false)
}
