import AppKit
import SwiftUI

enum ConnectionLogoLoader {
    static func decode(_ data: Data) -> NSImage? {
        NSImage(data: data)
    }
}

struct ConnectionLogoView: View {
    let url: URL?
    let name: String

    @State private var image: NSImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(DesktopTheme.panel)

            if let image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(5)
            } else {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DesktopTheme.textSecondary)
            }
        }
        .frame(width: 34, height: 34)
        .task(id: url) {
            image = nil
            guard let url else { return }
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { return }
                try Task.checkCancellation()
                image = ConnectionLogoLoader.decode(data)
            } catch {
                image = nil
            }
        }
        .accessibilityHidden(true)
    }
}
