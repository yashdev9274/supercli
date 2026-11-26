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

import Cocoa
import Foundation
import QuickLook

extension TrayDrop {
    struct DropItem: Identifiable, Codable, Equatable, Hashable {
        let id: UUID

        let fileName: String
        let size: Int

        let copiedDate: Date
        let workspacePreviewImageData: Data

        init(url: URL) throws {
            assert(!Thread.isMainThread)

            id = UUID()
            fileName = url.lastPathComponent

            size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            copiedDate = Date()
            workspacePreviewImageData = url.snapshotPreview().pngRepresentation

            try FileManager.default.createDirectory(
                at: storageURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try FileManager.default.copyItem(at: url, to: storageURL)
        }
    }
}

extension TrayDrop.DropItem {
    static let mainDir = "CopiedItems"

    var storageURL: URL {
        documentsDirectory
            .appendingPathComponent(Self.mainDir)
            .appendingPathComponent(id.uuidString)
            .appendingPathComponent(fileName)
    }

    var workspacePreviewImage: NSImage {
        .init(data: workspacePreviewImageData) ?? .init()
    }

    var shouldClean: Bool {  // TODO: In the future clean if old
        return false
    }
}
