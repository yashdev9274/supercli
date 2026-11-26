/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
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

import Foundation
import IOKit.ps

/// Lightweight helper for querying macOS battery charging status and ETA.
final class MacBatteryManager {
    static let shared = MacBatteryManager()

    private init() {}

    struct BatteryStatus {
        let timeRemainingMinutes: Int?
        let isCharging: Bool
        let percentage: Int?
    }

    func currentStatus() -> BatteryStatus {
        guard let sourcesInfo = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let sourcesList = IOPSCopyPowerSourcesList(sourcesInfo)?.takeRetainedValue() as? [CFTypeRef] else {
            return BatteryStatus(timeRemainingMinutes: nil, isCharging: false, percentage: nil)
        }

        for source in sourcesList {
            guard let description = IOPSGetPowerSourceDescription(sourcesInfo, source)?.takeUnretainedValue() as? [String: Any],
                  let type = description[kIOPSTypeKey] as? String,
                  type == kIOPSInternalBatteryType else {
                continue
            }

            let isCharging = description[kIOPSIsChargingKey] as? Bool ?? false
            let timeRemaining = description[kIOPSTimeToFullChargeKey] as? Int
            let currentCapacity = description[kIOPSCurrentCapacityKey] as? Int
            let maxCapacity = description[kIOPSMaxCapacityKey] as? Int

            let percentage: Int?
            if let current = currentCapacity, let max = maxCapacity, max > 0 {
                percentage = (current * 100) / max
            } else {
                percentage = nil
            }

            return BatteryStatus(
                timeRemainingMinutes: timeRemaining,
                isCharging: isCharging,
                percentage: percentage
            )
        }

        return BatteryStatus(timeRemainingMinutes: nil, isCharging: false, percentage: nil)
    }

    func formattedTimeToFullCharge() -> String? {
        let status = currentStatus()
        guard status.isCharging, let minutes = status.timeRemainingMinutes, minutes > 0 else {
            return nil
        }

        let hours = minutes / 60
        let remainingMinutes = minutes % 60

        if hours > 0 {
            return "\(hours)h \(remainingMinutes)m"
        }
        return "\(remainingMinutes)m"
    }
}
