import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let destination = root.appendingPathComponent("SupercodeDesktop/Resources/Assets.xcassets/AppIcon.appiconset")
let sizes = [("icon_16.png", 16), ("icon_16@2x.png", 32), ("icon_32.png", 32), ("icon_32@2x.png", 64), ("icon_128.png", 128), ("icon_128@2x.png", 256), ("icon_256.png", 256), ("icon_256@2x.png", 512), ("icon_512.png", 512), ("icon_512@2x.png", 1024)]
for (name, size) in sizes {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let context = NSGraphicsContext.current!.cgContext
    context.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    let tile = NSBezierPath(roundedRect: NSRect(x: 72, y: 72, width: 880, height: 880), xRadius: 194, yRadius: 194)
    NSColor(calibratedWhite: 0.07, alpha: 1).setFill()
    tile.fill()
    NSColor(calibratedWhite: 0.24, alpha: 1).setStroke()
    tile.lineWidth = 3
    tile.stroke()
    // Bold, geometric white S on the monochrome Supercode tile.
    let font = NSFont.monospacedSystemFont(ofSize: 760, weight: .black)
    let string = NSAttributedString(string: "S", attributes: [.font: font, .foregroundColor: NSColor.white])
    let ctLine = CTLineCreateWithAttributedString(string)
    let bounds = CTLineGetBoundsWithOptions(ctLine, .useGlyphPathBounds)
    context.textPosition = CGPoint(x: 512 - bounds.midX, y: 512 - bounds.midY)
    CTLineDraw(ctLine, context)
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination.appendingPathComponent(name))
}
