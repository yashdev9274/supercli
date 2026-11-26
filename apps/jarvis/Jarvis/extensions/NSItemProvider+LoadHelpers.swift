/*
 * Atoll (DynamicIsland)
 * Copyright (C) 2024-2026 Atoll Contributors
 *
 * Originally from boring.notch project
 * Modified and adapted for Atoll (DynamicIsland)
 * See NOTICE for details.
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

import AppKit
import Foundation
import UniformTypeIdentifiers

extension NSItemProvider {
    func extractItem() async -> URL? {
        await loadFileURL(typeIdentifier: UTType.item.identifier)
    }

    /// Detects if this is a file dragged from the filesystem
    func extractFileURL() async -> URL? {
        if hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            return await loadFileURL(typeIdentifier: UTType.fileURL.identifier)
        }
        return nil
    }

    /// Loads raw data for the given type identifier
    func loadData() async -> Data? {
        guard hasItemConformingToTypeIdentifier(UTType.data.identifier) else { return nil }
        
        final class ProviderWrapper: @unchecked Sendable {
            let provider: NSItemProvider
            init(_ provider: NSItemProvider) { self.provider = provider }
        }
        let wrapper = ProviderWrapper(self)

        return await withCheckedContinuation { (cont: CheckedContinuation<Data?, Never>) in
            loadItem(forTypeIdentifier: UTType.data.identifier, options: nil) { item, error in
                if let error {
                    print("Error loading data for type \(UTType.data.identifier): \(error.localizedDescription)")
                    cont.resume(returning: nil)
                    return
                }
                if let url = item as? URL, let data = try? Data(contentsOf: url) {
                    if !url.absoluteString.contains("com.apple.SwiftUI.filePromises") {
                        cont.resume(returning: nil)
                        return
                    }
                    wrapper.provider.suggestedName = wrapper.provider.suggestedName ?? url.lastPathComponent
                    let fileManager = FileManager.default
                    let folderURL = url.deletingLastPathComponent()
                    do {
                        try fileManager.removeItem(at: url)
                        let contents = try fileManager.contentsOfDirectory(atPath: folderURL.path)
                        if contents.isEmpty {
                            try fileManager.removeItem(at: folderURL)
                        }
                    } catch {
                        print("Error: \(error.localizedDescription)")
                    }
                    cont.resume(returning: data)
                } else if let data = item as? Data {
                    cont.resume(returning: data)
                } else {
                    cont.resume(returning: nil)
                }
            }
        }
    }

    /// Attempts to extract a URL (web link) from the provider
    func extractURL() async -> URL? {
        if hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = await loadURL(typeIdentifier: UTType.url.identifier) {
                guard url.scheme != nil else { return nil }
                return url
            }
        }
        return nil
    }

    func extractText() async -> String? {
        let textTypes = [UTType.utf8PlainText.identifier, UTType.plainText.identifier]
        for typeIdentifier in textTypes where hasItemConformingToTypeIdentifier(typeIdentifier) {
            if let text = await loadText(typeIdentifier: typeIdentifier) {
                return text
            }
        }
        return nil
    }

    /// Loads a file URL from the provider for the given type identifier.
    func loadFileURL(typeIdentifier: String) async -> URL? {
        await withCheckedContinuation { (cont: CheckedContinuation<URL?, Never>) in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error {
                    print("❌ Error loading item for type \(typeIdentifier): \(error.localizedDescription)")
                    cont.resume(returning: nil)
                    return
                }
                var resolvedURL: URL?
                if let url = item as? URL {
                    resolvedURL = url
                } else if let data = item as? Data {
                    if let string = String(data: data, encoding: .utf8) {
                        if let url = URL(string: string) {
                            resolvedURL = url
                        } else if string.hasPrefix("/") {
                            resolvedURL = URL(fileURLWithPath: string)
                        }
                    }
                    if resolvedURL == nil {
                        let bookmark = Bookmark(data: data)
                        resolvedURL = bookmark.resolveURL()
                    }
                } else if let string = item as? String {
                    if let url = URL(string: string) {
                        resolvedURL = url
                    } else if string.hasPrefix("/") {
                        resolvedURL = URL(fileURLWithPath: string)
                    }
                }
                cont.resume(returning: resolvedURL)
            }
        }
    }

    /// Loads a URL from the provider for the given type identifier.
    func loadURL(typeIdentifier: String) async -> URL? {
        await withCheckedContinuation { (cont: CheckedContinuation<URL?, Never>) in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if error != nil {
                    cont.resume(returning: nil)
                    return
                }
                if let url = item as? URL {
                    cont.resume(returning: url)
                } else if let data = item as? Data {
                    if let string = String(data: data, encoding: .utf8) {
                        if let url = URL(string: string) {
                            cont.resume(returning: url)
                            return
                        } else if string.hasPrefix("/") {
                            cont.resume(returning: URL(fileURLWithPath: string))
                            return
                        }
                    }
                    cont.resume(returning: nil)
                } else if let string = item as? String {
                    if let url = URL(string: string) {
                        cont.resume(returning: url)
                    } else if string.hasPrefix("/") {
                        cont.resume(returning: URL(fileURLWithPath: string))
                    } else {
                        cont.resume(returning: nil)
                    }
                } else {
                    cont.resume(returning: nil)
                }
            }
        }
    }

    /// Loads text from the provider for the given type identifier.
    func loadText(typeIdentifier: String) async -> String? {
        await withCheckedContinuation { (cont: CheckedContinuation<String?, Never>) in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if error != nil {
                    cont.resume(returning: nil)
                    return
                }
                if let string = item as? String {
                    cont.resume(returning: string)
                } else if let data = item as? Data,
                          let string = String(data: data, encoding: .utf8) {
                    cont.resume(returning: string)
                } else {
                    cont.resume(returning: nil)
                }
            }
        }
    }
}
