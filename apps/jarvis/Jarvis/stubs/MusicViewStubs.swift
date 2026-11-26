#if os(macOS)
import SwiftUI
import Defaults

// MARK: - shouldUseDynamicIslandMode
func shouldUseDynamicIslandMode(for screen: String?) -> Bool {
    return false
}

// MARK: - LikeTrackControl
struct LikeTrackControl: View {
    @ViewBuilder let content: (Presentation, @escaping () -> Void) -> AnyView
    
    struct Presentation {
        let iconName: String
        let isActive: Bool
    }
    
    @State private var isLiked = false
    
    init(@ViewBuilder content: @escaping (Presentation, @escaping () -> Void) -> some View) {
        self.content = { presentation, toggle in AnyView(content(presentation, toggle)) }
    }
    
    var body: some View {
        content(
            Presentation(
                iconName: isLiked ? "heart.fill" : "heart",
                isActive: isLiked
            ),
            { isLiked.toggle() }
        )
    }
}

// MARK: - DynamicIslandArtworkSourceView
struct DynamicIslandArtworkSourceView: View {
    let cornerRadius: CGFloat
    let contentMode: ContentMode
    
    var body: some View {
        let artwork = MusicManager.shared.albumArt
        if artwork !== defaultImage {
            Image(nsImage: artwork)
                .resizable()
                .aspectRatio(contentMode: contentMode)
        } else {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(.gray.opacity(0.3))
        }
    }
}

// MARK: - LiveStreamProgressIndicator
struct LiveStreamProgressIndicator: View {
    let tint: Color
    
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(.gray.opacity(0.3))
                    .frame(height: 4)
                RoundedRectangle(cornerRadius: 2)
                    .fill(tint)
                    .frame(width: geo.size.width * 0.3, height: 4)
            }
        }
        .frame(height: 4)
    }
}

// MARK: - RealTimeWaveformScrubberView
struct RealTimeWaveformScrubberView: View {
    let color: Color
    let secondaryColor: Color?
    let progress: Double
    let minHeight: CGFloat
    
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottomLeading) {
                ForEach(0..<20, id: \.self) { i in
                    let h = CGFloat.random(in: 0.2...1.0) * geo.size.height
                    Rectangle()
                        .fill(color.opacity(0.5))
                        .frame(width: 3, height: h)
                        .offset(x: CGFloat(i) * 4, y: geo.size.height - h)
                }
                Rectangle()
                    .fill(secondaryColor ?? color)
                    .frame(width: 3, height: geo.size.height)
                    .offset(x: geo.size.width * progress)
            }
        }
    }
}

// MARK: - Missing Music Controls
struct MusicScrubber: View {
    var body: some View {
        EmptyView()
    }
}

// MARK: - Parallax3D Modifier
struct Parallax3DModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
    }
}

extension View {
    func parallax3D() -> some View {
        modifier(Parallax3DModifier())
    }
}
#endif
