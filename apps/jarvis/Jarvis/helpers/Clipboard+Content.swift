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

func getAttributedString(content: Any, type: NSPasteboard.PasteboardType) -> NSAttributedString? {
    if let stringContent = content as? String {
        return NSAttributedString(string: stringContent)
    }
    if type == .rtf, let data = content as? Data {
        return NSAttributedString(rtf: data, documentAttributes: nil)
    } else if type == .html, let data = content as? Data {
        return try? NSAttributedString(data: data, options: [.documentType: NSAttributedString.DocumentType.html], documentAttributes: nil)
    } else if type.rawValue == "public.utf8-plain-text", let data = content as? Data {
        return try? NSAttributedString(data: data, documentAttributes: nil)
    } else if type == .string {
        return NSAttributedString(string: content as? String ?? "")
    } else if type == .fileURL {
        return NSAttributedString(string: content as? String ?? "")
    } else if type == NSPasteboard.PasteboardType("com.apple.webarchive"), let data = content as? Data {
        return try? NSAttributedString(data: data, options: [.documentType: NSAttributedString.DocumentType.webArchive], documentAttributes: nil)
    }
    return nil
}

func isText(type: NSPasteboard.PasteboardType) -> Bool {
    return type == .string || type == .html || type == .rtf || type == .html || type == .string || type.rawValue == "public.utf8-plain-text" || type.rawValue == "public.utf16-external-plain-text" || type.rawValue == "com.apple.webarchive"
}
