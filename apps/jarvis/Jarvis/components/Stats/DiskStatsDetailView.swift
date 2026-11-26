/*
 * JARVIS (Jarvis)
 * Copyright (C) 2024-2026 JARVIS Contributors
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

import SwiftUI

struct DiskStatsDetailView: View {
    @ObservedObject private var statsManager = StatsManager.shared
    
    private let readColor = Color.cyan
    private let writeColor = Color.yellow
    private let cardBackground = Color(nsColor: .windowBackgroundColor).opacity(0.65)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                StatsCard(title: String(localized: "Disk Overview"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    DiskOverview(
                        readSpeed: statsManager.diskRead,
                        writeSpeed: statsManager.diskWrite,
                        peakRead: statsManager.diskReadHistory.max() ?? 0,
                        peakWrite: statsManager.diskWriteHistory.max() ?? 0,
                        readColor: readColor,
                        writeColor: writeColor
                    )
                }
                
                StatsCard(title: String(localized: "Storage Devices"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    DiskDevicesCard(devices: statsManager.diskDevices, accentColor: readColor)
                }
                
                StatsCard(title: String(localized: "Session Totals"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    DiskTotalsView(totals: statsManager.diskTotals, readColor: readColor, writeColor: writeColor)
                }
            }
            .padding(16)
        }
        .frame(minWidth: 360, minHeight: 340)
    }
}

private struct DiskOverview: View {
    let readSpeed: Double
    let writeSpeed: Double
    let peakRead: Double
    let peakWrite: Double
    let readColor: Color
    let writeColor: Color
    
    var body: some View {
        HStack(alignment: .center, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Read")
                    .font(.headline)
                    .foregroundColor(readColor)
                Text(StatsFormatting.mbPerSecond(readSpeed))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                DetailRow(color: readColor.opacity(0.6), label: "Peak", value: StatsFormatting.mbPerSecond(peakRead))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            Divider()
                .frame(height: 110)
                .overlay(Color.white.opacity(0.06))
            
            VStack(alignment: .leading, spacing: 10) {
                Text("Write")
                    .font(.headline)
                    .foregroundColor(writeColor)
                Text(StatsFormatting.mbPerSecond(writeSpeed))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                DetailRow(color: writeColor.opacity(0.6), label: "Peak", value: StatsFormatting.mbPerSecond(peakWrite))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DiskTotalsView: View {
    let totals: DiskTotals
    let readColor: Color
    let writeColor: Color
    
    var body: some View {
        VStack(spacing: 10) {
            DetailRow(color: readColor.opacity(0.75), label: String(localized: "Read"), value: formattedBytes(totals.readMB))
            DetailRow(color: writeColor.opacity(0.75), label: String(localized: "Written"), value: formattedBytes(totals.writtenMB))
        }
    }
    
    private func formattedBytes(_ megabytes: Double) -> String {
        let bytes = UInt64(megabytes * 1_048_576)
        return StatsFormatting.bytes(bytes)
    }
}

private struct DiskDevicesCard: View {
    let devices: [DiskDeviceMetrics]
    let accentColor: Color

    private var sortedDevices: [DiskDeviceMetrics] {
        devices.sorted { lhs, rhs in
            if lhs.isRoot != rhs.isRoot {
                return lhs.isRoot && !rhs.isRoot
            }
            if lhs.isRemovable != rhs.isRemovable {
                return !lhs.isRemovable && rhs.isRemovable
            }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    var body: some View {
        if sortedDevices.isEmpty {
            Text("No storage devices detected yet.")
                .font(.footnote)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(spacing: 12) {
                ForEach(sortedDevices) { device in
                    DiskDeviceRow(device: device, accentColor: accentColor)
                    if device.id != sortedDevices.last?.id {
                        Divider().padding(.leading, 36)
                    }
                }
            }
        }
    }
}

private struct DiskDeviceRow: View {
    let device: DiskDeviceMetrics
    let accentColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(accentColor.opacity(0.16))
                    .overlay(
                        Image(systemName: device.isRemovable ? "externaldrive" : "internaldrive")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(accentColor)
                    )
                    .frame(width: 32, height: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(device.name)
                        .font(.system(size: 13, weight: .semibold))
                    Text(device.path.path)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                if device.isRoot {
                    Text("System")
                        .font(.caption2)
                        .foregroundColor(accentColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(accentColor.opacity(0.16))
                        .clipShape(Capsule())
                } else if device.isRemovable {
                    Text("External")
                        .font(.caption2)
                        .foregroundColor(accentColor)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(accentColor.opacity(0.16))
                        .clipShape(Capsule())
                }
            }

            DiskUsageBar(usedBytes: device.usedBytes, totalBytes: device.totalBytes, tint: accentColor)
                .frame(height: 8)

            HStack {
                Text("Used · \(StatsFormatting.bytes(device.usedBytes))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Spacer()
                Text("Free · \(StatsFormatting.bytes(device.freeBytes))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            Text("Total · \(StatsFormatting.bytes(device.totalBytes))")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

private struct DiskUsageBar: View {
    let usedBytes: UInt64
    let totalBytes: UInt64
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let progress = totalBytes > 0 ? min(max(Double(usedBytes) / Double(totalBytes), 0), 1) : 0
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.primary.opacity(0.08))
                Capsule()
                    .fill(tint.opacity(0.8))
                    .frame(width: width * progress)
            }
        }
    }
}
