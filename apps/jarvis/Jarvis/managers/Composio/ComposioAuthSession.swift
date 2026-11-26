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

import AppKit
import AuthenticationServices

enum ComposioAuthError: LocalizedError {
    case canceled
    case sessionFailed(String)

    var errorDescription: String? {
        switch self {
        case .canceled:
            return String(localized: "Connection canceled.")
        case let .sessionFailed(message):
            return String(localized: "Authentication session failed: \(message)")
        }
    }
}

/// Presents the Composio hosted connect page (connect.composio.dev) in an
/// `ASWebAuthenticationSession`. The session completes with the configured
/// `atoll-composio://oauth-callback` redirect; Composio's page drops us back
/// into the app when the user finishes (or cancels) the OAuth flow.
@MainActor
protocol ComposioAuthSessionPresenting {
    func authenticate(url: URL) async throws
}

@MainActor
final class ComposioAuthSessionPresenter: NSObject, ComposioAuthSessionPresenting {
    private static let callbackURLScheme = "atoll-composio"

    private var session: ASWebAuthenticationSession?

    func authenticate(url: URL) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            var hasResumed = false
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: Self.callbackURLScheme
            ) { _, error in
                guard !hasResumed else { return }
                hasResumed = true

                if let error {
                    if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                        continuation.resume(throwing: ComposioAuthError.canceled)
                    } else {
                        continuation.resume(
                            throwing: ComposioAuthError.sessionFailed(error.localizedDescription)
                        )
                    }
                    return
                }
                continuation.resume()
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }
}

extension ComposioAuthSessionPresenter: ASWebAuthenticationPresentationContextProviding {
    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            NSApp.mainWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
        }
    }
}
