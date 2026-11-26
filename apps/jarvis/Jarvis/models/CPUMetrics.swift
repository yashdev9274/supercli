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

import Foundation

struct CPULoadBreakdown: Equatable {
    var user: Double
    var system: Double
    var idle: Double
    
    static let zero = CPULoadBreakdown(user: 0, system: 0, idle: 100)
    
    var activeUsage: Double {
        let active = user + system
        return min(max(active, 0), 100)
    }
    
    var normalizedSegments: (user: Double, system: Double, idle: Double) {
        let total = max(user + system + idle, 0.001)
        let userFraction = min(max(user / total, 0), 1)
        let systemFraction = min(max(system / total, 0), 1)
        let idleFraction = min(max(idle / total, 0), 1)
        return (userFraction, systemFraction, idleFraction)
    }
}

struct LoadAverage: Equatable {
    var oneMinute: Double
    var fiveMinutes: Double
    var fifteenMinutes: Double
    
    static let zero = LoadAverage(oneMinute: 0, fiveMinutes: 0, fifteenMinutes: 0)
}
