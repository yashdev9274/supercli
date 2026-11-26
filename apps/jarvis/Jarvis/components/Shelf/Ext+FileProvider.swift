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
import UniformTypeIdentifiers

extension NSItemProvider {
    private func duplicateToOurStorage(_ url: URL?) throws -> URL? {
        guard let url else { return nil }
        let temp = temporaryDirectory
            .appendingPathComponent("TemporaryDrop")
            .appendingPathComponent(UUID().uuidString)
            .appendingPathComponent(url.lastPathComponent)
        try? FileManager.default.createDirectory(
            at: temp.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try FileManager.default.copyItem(at: url, to: temp)
        return temp
    }

    func convertToFilePathThatIsWhatWeThinkItWillWorkWithNotchDrop() -> URL? {
        var url: URL?
        let sem = DispatchSemaphore(value: 0)
        _ = loadObject(ofClass: URL.self) { item, _ in
            url = try? self.duplicateToOurStorage(item)
            sem.signal()
        }
        sem.wait()
        if url == nil {
            loadInPlaceFileRepresentation(
                forTypeIdentifier: UTType.data.identifier
            ) { input, _, _ in
                defer { sem.signal() }
                url = try? self.duplicateToOurStorage(input)
            }
            sem.wait()
        }
        return url
    }
}

extension [NSItemProvider] {
    func interfaceConvert() -> [URL]? {
        let urls = compactMap { provider -> URL? in
            provider.convertToFilePathThatIsWhatWeThinkItWillWorkWithNotchDrop()
        }
        guard urls.count == count else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                NSAlert.popError(NSLocalizedString("One or more files failed to load", comment: ""))
            }
            return nil
        }
        return urls
    }
}
