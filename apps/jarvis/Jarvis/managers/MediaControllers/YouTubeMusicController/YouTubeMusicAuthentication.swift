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

// MARK: - Authentication Manager
actor YouTubeMusicAuthManager {
    private var accessToken: String?
    private var authenticationTask: Task<String, Error>?
    private let httpClient: YouTubeMusicHTTPClient
    
    init(httpClient: YouTubeMusicHTTPClient) {
        self.httpClient = httpClient
    }
    
    var currentToken: String? {
        accessToken
    }
    
    func authenticate() async throws -> String {
        // Return existing token if valid
        if let token = accessToken {
            return token
        }
        
        // Wait for ongoing authentication if in progress
        if let task = authenticationTask {
            return try await task.value
        }
        
        // Start new authentication
        let task = Task<String, Error> {
            do {
                let token = try await httpClient.authenticate()
                await setToken(token)
                return token
            } catch {
                await clearAuthenticationTask()
                throw error
            }
        }
        
        authenticationTask = task
        return try await task.value
    }
    
    func invalidateToken() async {
        accessToken = nil
        authenticationTask?.cancel()
        authenticationTask = nil
    }
    
    private func setToken(_ token: String) async {
        accessToken = token
        authenticationTask = nil
    }
    
    private func clearAuthenticationTask() async {
        authenticationTask = nil
    }
}

// MARK: - Authentication State
enum AuthenticationState: Sendable {
    case unauthenticated
    case authenticating
    case authenticated(String)
    case failed(Error)
    
    var isAuthenticated: Bool {
        if case .authenticated = self {
            return true
        }
        return false
    }
    
    var token: String? {
        if case .authenticated(let token) = self {
            return token
        }
        return nil
    }
}
