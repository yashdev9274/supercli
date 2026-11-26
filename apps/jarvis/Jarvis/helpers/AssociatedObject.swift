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

import Foundation
import ObjectiveC

public struct AssociatedObject<Value: AnyObject> {
    private let key: UnsafeRawPointer
    private let policy: objc_AssociationPolicy

    public init(_ policy: objc_AssociationPolicy = .OBJC_ASSOCIATION_RETAIN_NONATOMIC) {
        self.key = UnsafeRawPointer(Unmanaged.passUnretained(UniqueKey()).toOpaque())
        self.policy = policy
    }

    private final class UniqueKey {}

    public subscript<Owner: AnyObject>(_ owner: Owner) -> Value? {
        get { objc_getAssociatedObject(owner, key) as? Value }
        nonmutating set { objc_setAssociatedObject(owner, key, newValue, policy) }
    }
}

extension AssociatedObject: @unchecked Sendable where Value: Sendable {}
