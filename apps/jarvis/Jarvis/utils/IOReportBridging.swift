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
import Darwin

public typealias IOReportSubscriptionRef = OpaquePointer

private enum IOReportLoader {
	private static let libraryHandle: UnsafeMutableRawPointer? = {
		let paths = [
			"/System/Library/PrivateFrameworks/IOReport.framework/IOReport",
			"/usr/lib/libIOReport.dylib"
		]
		for path in paths {
			if let handle = dlopen(path, RTLD_LAZY | RTLD_LOCAL) {
				return handle
			}
		}
		return nil
	}()

	static func symbol<T>(_ name: String, as type: T.Type) -> T? {
		guard let handle = libraryHandle, let pointer = dlsym(handle, name) else {
			return nil
		}
		return unsafeBitCast(pointer, to: T.self)
	}
}

func IOReportCopyChannelsInGroup(_ group: CFString?, _ subGroup: CFString?, _ a: UInt64, _ b: UInt64, _ c: UInt64) -> Unmanaged<CFDictionary>? {
	typealias Fn = @convention(c) (CFString?, CFString?, UInt64, UInt64, UInt64) -> Unmanaged<CFDictionary>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportCopyChannelsInGroup", as: Fn.self) else { return nil }
	return fn(group, subGroup, a, b, c)
}

func IOReportMergeChannels(_ a: CFDictionary, _ b: CFDictionary, _ c: CFTypeRef?) {
	typealias Fn = @convention(c) (CFDictionary, CFDictionary, CFTypeRef?) -> Void
	guard let fn: Fn = IOReportLoader.symbol("IOReportMergeChannels", as: Fn.self) else { return }
	fn(a, b, c)
}

func IOReportCreateSubscription(_ a: UnsafeMutableRawPointer?, _ b: CFMutableDictionary?, _ c: UnsafeMutablePointer<Unmanaged<CFMutableDictionary>?>?, _ d: UInt64, _ e: CFTypeRef?) -> IOReportSubscriptionRef? {
	typealias Fn = @convention(c) (UnsafeMutableRawPointer?, CFMutableDictionary?, UnsafeMutablePointer<Unmanaged<CFMutableDictionary>?>?, UInt64, CFTypeRef?) -> IOReportSubscriptionRef?
	guard let fn: Fn = IOReportLoader.symbol("IOReportCreateSubscription", as: Fn.self) else { return nil }
	return fn(a, b, c, d, e)
}

func IOReportCreateSamples(_ subscription: IOReportSubscriptionRef?, _ channels: CFMutableDictionary?, _ client: CFTypeRef?) -> Unmanaged<CFDictionary>? {
	typealias Fn = @convention(c) (IOReportSubscriptionRef?, CFMutableDictionary?, CFTypeRef?) -> Unmanaged<CFDictionary>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportCreateSamples", as: Fn.self) else { return nil }
	return fn(subscription, channels, client)
}

func IOReportCreateSamplesDelta(_ previous: CFDictionary, _ current: CFDictionary, _ zone: CFTypeRef?) -> Unmanaged<CFDictionary>? {
	typealias Fn = @convention(c) (CFDictionary, CFDictionary, CFTypeRef?) -> Unmanaged<CFDictionary>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportCreateSamplesDelta", as: Fn.self) else { return nil }
	return fn(previous, current, zone)
}

func IOReportChannelGetGroup(_ dictionary: CFDictionary) -> Unmanaged<CFString>? {
	typealias Fn = @convention(c) (CFDictionary) -> Unmanaged<CFString>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportChannelGetGroup", as: Fn.self) else { return nil }
	return fn(dictionary)
}

func IOReportChannelGetSubGroup(_ dictionary: CFDictionary) -> Unmanaged<CFString>? {
	typealias Fn = @convention(c) (CFDictionary) -> Unmanaged<CFString>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportChannelGetSubGroup", as: Fn.self) else { return nil }
	return fn(dictionary)
}

func IOReportChannelGetChannelName(_ dictionary: CFDictionary) -> Unmanaged<CFString>? {
	typealias Fn = @convention(c) (CFDictionary) -> Unmanaged<CFString>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportChannelGetChannelName", as: Fn.self) else { return nil }
	return fn(dictionary)
}

func IOReportChannelGetUnitLabel(_ dictionary: CFDictionary) -> Unmanaged<CFString>? {
	typealias Fn = @convention(c) (CFDictionary) -> Unmanaged<CFString>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportChannelGetUnitLabel", as: Fn.self) else { return nil }
	return fn(dictionary)
}

func IOReportStateGetCount(_ dictionary: CFDictionary) -> Int32 {
	typealias Fn = @convention(c) (CFDictionary) -> Int32
	guard let fn: Fn = IOReportLoader.symbol("IOReportStateGetCount", as: Fn.self) else { return 0 }
	return fn(dictionary)
}

func IOReportStateGetNameForIndex(_ dictionary: CFDictionary, _ index: Int32) -> Unmanaged<CFString>? {
	typealias Fn = @convention(c) (CFDictionary, Int32) -> Unmanaged<CFString>?
	guard let fn: Fn = IOReportLoader.symbol("IOReportStateGetNameForIndex", as: Fn.self) else { return nil }
	return fn(dictionary, index)
}

func IOReportStateGetResidency(_ dictionary: CFDictionary, _ index: Int32) -> Int64 {
	typealias Fn = @convention(c) (CFDictionary, Int32) -> Int64
	guard let fn: Fn = IOReportLoader.symbol("IOReportStateGetResidency", as: Fn.self) else { return 0 }
	return fn(dictionary, index)
}

func IOReportSimpleGetIntegerValue(_ dictionary: CFDictionary, _ index: Int32) -> Int64 {
	typealias Fn = @convention(c) (CFDictionary, Int32) -> Int64
	guard let fn: Fn = IOReportLoader.symbol("IOReportSimpleGetIntegerValue", as: Fn.self) else { return 0 }
	return fn(dictionary, index)
}
