import SwiftUI

struct DynamicIslandPillShape: Shape {
    private var cornerRadius: CGFloat

    init(cornerRadius: CGFloat = 20) {
        self.cornerRadius = cornerRadius
    }

    var animatableData: CGFloat {
        get { cornerRadius }
        set { cornerRadius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        Path(roundedRect: rect, cornerRadius: cornerRadius)
    }
}

#Preview {
    DynamicIslandPillShape(cornerRadius: 20)
        .frame(width: 120, height: 36)
        .padding(10)
}
