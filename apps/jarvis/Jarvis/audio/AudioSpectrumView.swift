#if os(macOS)
import SwiftUI

struct AudioSpectrumView: View {
    @Binding var isPlaying: Bool
    @State private var phases: [Double] = Array(repeating: 0, count: 12)

    let timer = Timer.publish(every: 0.15, on: .main, in: .common).autoconnect()

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<12, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.accentColor.opacity(0.8))
                    .frame(width: 3, height: max(4, phases[i] * 40))
                    .animation(.easeInOut(duration: 0.15), value: phases[i])
            }
        }
        .frame(height: 40)
        .onReceive(timer) { _ in
            guard isPlaying else { return }
            for i in phases.indices {
                phases[i] = Double.random(in: 0.1...1.0)
            }
        }
        .onAppear {
            phases = Array(repeating: 4, count: 12)
        }
    }
}
#endif
