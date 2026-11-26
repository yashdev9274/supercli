#if os(macOS)
import SwiftUI

struct ClipboardPopover: View {
    var body: some View {
        Text("Clipboard")
            .padding()
            .frame(width: 300, height: 200)
    }
}

struct ColorPickerPopover: View {
    var body: some View {
        Text("Color Picker")
            .padding()
            .frame(width: 250, height: 200)
    }
}

struct RecordingIndicator: View {
    var body: some View {
        Image(systemName: "record.circle.fill")
            .foregroundStyle(.red)
            .symbolEffect(.pulse)
    }
}

struct FocusIndicator: View {
    var body: some View {
        Image(systemName: "moon.fill")
            .foregroundStyle(.purple)
    }
}

struct MinimalisticBatteryView: View {
    let levelBattery: Float
    let isPluggedIn: Bool
    let isCharging: Bool
    let isInLowPowerMode: Bool
    let bodyWidth: CGFloat
    let bodyHeight: CGFloat
    let isForNotification: Bool
    let showPercentInside: Bool

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: isCharging ? "bolt.fill" : batteryIcon)
                .font(.system(size: 8))
            if showPercentInside {
                Text("\(Int(levelBattery * 100))%")
                    .font(.system(size: 8, weight: .medium))
            }
        }
        .foregroundStyle(levelBattery < 0.2 ? .red : .primary)
        .frame(width: bodyWidth, height: bodyHeight)
    }

    private var batteryIcon: String {
        switch levelBattery {
        case 0..<0.2: return "battery.0percent"
        case 0.2..<0.5: return "battery.25percent"
        case 0.5..<0.75: return "battery.50percent"
        case 0.75..<1.0: return "battery.75percent"
        default: return "battery.100percent"
        }
    }
}

 struct JarvisBatteryView: View {
    let batteryWidth: CGFloat
    let isCharging: Bool
    let isInLowPowerMode: Bool
    let isPluggedIn: Bool
    let levelBattery: Float
    let maxCapacity: Float
    let timeToFullCharge: Int
    let isForNotification: Bool

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: isCharging ? "bolt.fill" : batteryIcon)
                .font(.system(size: 10))
            Text("\(Int(levelBattery * 100))%")
                .font(.system(size: 10, weight: .medium))
        }
        .foregroundStyle(levelBattery < 0.2 ? .red : .primary)
        .frame(width: batteryWidth)
    }

    private var batteryIcon: String {
        switch levelBattery {
        case 0..<0.2: return "battery.0percent"
        case 0.2..<0.5: return "battery.25percent"
        case 0.5..<0.75: return "battery.50percent"
        case 0.75..<1.0: return "battery.75percent"
        default: return "battery.100percent"
        }
    }
}
#endif
