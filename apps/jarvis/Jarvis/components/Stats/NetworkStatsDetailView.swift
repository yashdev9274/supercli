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

struct NetworkStatsDetailView: View {
    @ObservedObject private var statsManager = StatsManager.shared
    
    private let downloadColor = Color.orange
    private let uploadColor = Color.red
    private let cardBackground = Color(nsColor: .windowBackgroundColor).opacity(0.65)
    
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                StatsCard(title: String(localized: "Network Overview"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    NetworkOverview(
                        download: statsManager.networkDownload,
                        upload: statsManager.networkUpload,
                        avgDownload: average(statsManager.networkDownloadHistory),
                        avgUpload: average(statsManager.networkUploadHistory),
                        peakDownload: statsManager.networkDownloadHistory.max() ?? 0,
                        peakUpload: statsManager.networkUploadHistory.max() ?? 0,
                        downloadColor: downloadColor,
                        uploadColor: uploadColor
                    )
                }
                
                StatsCard(title: String(localized: "Interfaces"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    NetworkInterfacesCard(
                        interfaces: statsManager.networkInterfaces,
                        downloadColor: downloadColor,
                        uploadColor: uploadColor
                    )
                }
                
                StatsCard(title: String(localized: "Session Totals"), padding: 16, background: cardBackground, cornerRadius: 12) {
                    NetworkTotalsView(totals: statsManager.networkTotals, downloadColor: downloadColor, uploadColor: uploadColor)
                }
            }
            .padding(16)
        }
        .frame(minWidth: 360, minHeight: 340)
    }
    
    private func average(_ values: [Double]) -> Double {
        guard !values.isEmpty else { return 0 }
        let filtered = values.filter { $0 > 0 }
        guard !filtered.isEmpty else { return 0 }
        return filtered.reduce(0, +) / Double(filtered.count)
    }
}

private struct NetworkOverview: View {
    let download: Double
    let upload: Double
    let avgDownload: Double
    let avgUpload: Double
    let peakDownload: Double
    let peakUpload: Double
    let downloadColor: Color
    let uploadColor: Color
    
    var body: some View {
        HStack(alignment: .center, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Download")
                    .font(.headline)
                    .foregroundColor(downloadColor)
                Text(StatsFormatting.throughput(download))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                DetailRow(color: downloadColor.opacity(0.6), label: "Average", value: StatsFormatting.throughput(avgDownload))
                DetailRow(color: downloadColor.opacity(0.45), label: "Peak", value: StatsFormatting.throughput(peakDownload))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            
            Divider()
                .frame(height: 110)
                .overlay(Color.white.opacity(0.06))
            
            VStack(alignment: .leading, spacing: 10) {
                Text("Upload")
                    .font(.headline)
                    .foregroundColor(uploadColor)
                Text(StatsFormatting.throughput(upload))
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                DetailRow(color: uploadColor.opacity(0.6), label: String(localized: "Average"), value: StatsFormatting.throughput(avgUpload))
                DetailRow(color: uploadColor.opacity(0.45), label: String(localized: "Peak"), value: StatsFormatting.throughput(peakUpload))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct NetworkTotalsView: View {
    let totals: NetworkTotals
    let downloadColor: Color
    let uploadColor: Color
    
    var body: some View {
        VStack(spacing: 10) {
            DetailRow(color: downloadColor.opacity(0.75), label: String(localized: "Downloaded"), value: formattedBytes(totals.downloadedMB))
            DetailRow(color: uploadColor.opacity(0.75), label: String(localized: "Uploaded"), value: formattedBytes(totals.uploadedMB))
        }
    }
    
    private func formattedBytes(_ megabytes: Double) -> String {
        let bytes = UInt64(megabytes * 1_048_576)
        return StatsFormatting.bytes(bytes)
    }
}

private struct NetworkInterfacesCard: View {
    let interfaces: [NetworkInterfaceMetrics]
    let downloadColor: Color
    let uploadColor: Color

    private var sortedInterfaces: [NetworkInterfaceMetrics] {
        interfaces.sorted { lhs, rhs in
            if lhs.isActive != rhs.isActive {
                return lhs.isActive && !rhs.isActive
            }
            return interfacePriority(lhs.type) < interfacePriority(rhs.type)
        }
    }

    private func interfacePriority(_ type: NetworkInterfaceType) -> Int {
        switch type {
        case .wifi:
            return 0
        case .ethernet:
            return 1
        case .cellular:
            return 2
        case .other:
            return 3
        case .loopback:
            return 4
        }
    }

    var body: some View {
        if sortedInterfaces.isEmpty {
            Text("No active interfaces detected yet.")
                .font(.footnote)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(spacing: 12) {
                ForEach(sortedInterfaces) { interface in
                    NetworkInterfaceRow(
                        interface: interface,
                        downloadColor: downloadColor,
                        uploadColor: uploadColor
                    )
                    if interface.id != sortedInterfaces.last?.id {
                        Divider().padding(.leading, 44)
                    }
                }
            }
        }
    }
}

private struct NetworkInterfaceRow: View {
    let interface: NetworkInterfaceMetrics
    let downloadColor: Color
    let uploadColor: Color

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            icon
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(interface.displayName)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                    if interface.isActive {
                        Text(String(localized: "stats_resource_active", defaultValue: "Active"))
                            .font(.caption2)
                            .foregroundColor(downloadColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(downloadColor.opacity(0.16))
                            .clipShape(Capsule())
                    }
                }

                if let ipv4 = interface.ipv4, !ipv4.isEmpty {
                    Text("IPv4 · \(ipv4)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                if let ipv6 = interface.ipv6, !ipv6.isEmpty {
                    Text("IPv6 · \(ipv6)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Text("Session · ↓ \(formattedBytes(interface.totalDownloaded)) · ↑ \(formattedBytes(interface.totalUploaded))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                metricRow(label: String(localized: "Down"), value: StatsFormatting.throughput(interface.currentDownload), color: downloadColor)
                metricRow(label: String(localized: "Up"), value: StatsFormatting.throughput(interface.currentUpload), color: uploadColor)
            }
        }
    }

    private var icon: some View {
        let isActive = interface.isActive
        return RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(isActive ? downloadColor.opacity(0.18) : Color.primary.opacity(0.05))
            .overlay(
                Image(systemName: iconName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(isActive ? downloadColor : .secondary)
            )
            .frame(width: 32, height: 32)
    }

    private var iconName: String {
        switch interface.type {
        case .wifi:
            return "wifi"
        case .ethernet:
            return "cable.connector"
        case .cellular:
            return "antenna.radiowaves.left.and.right"
        case .loopback:
            return "arrow.triangle.2.circlepath"
        case .other:
            return "network"
        }
    }

    private func metricRow(label: String, value: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundColor(color)
        }
    }

    private func formattedBytes(_ megabytes: Double) -> String {
        let bytes = UInt64(max(megabytes, 0) * 1_048_576)
        return StatsFormatting.bytes(bytes)
    }
}
