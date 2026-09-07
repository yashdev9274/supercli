import SwiftUI

@main
struct SupercodeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
@StateObject private var session = AppSessionStore.shared
    @StateObject private var workspace = WorkspaceStore.shared
    @StateObject private var conversations = ConversationStore.shared
    @StateObject private var agentRun = AgentRunStore.shared
    @StateObject private var permissions = PermissionManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(workspace)
                .environmentObject(conversations)
                .environmentObject(agentRun)
                .environmentObject(permissions)
                .frame(minWidth: 1100, minHeight: 680)
                .background(DesktopTheme.background)
                .preferredColorScheme(.dark)
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Agent") {
                    Task { await conversations.createConversation(mode: conversations.mode.rawValue) }
                }
                .keyboardShortcut("n", modifiers: [.command])

                Button("Open Workspace…") {
                    workspace.pickWorkspace()
                }
                .keyboardShortcut("o", modifiers: [.command])
            }

CommandMenu("Agent") {
                Button("Focus Composer") {
                    NotificationCenter.default.post(name: .focusComposer, object: nil)
                }
                .keyboardShortcut("l", modifiers: [.command])

                Button("Stop Agent") {
                    AgentRunStore.shared.stop()
                }
                .keyboardShortcut(".", modifiers: [.command])

                Divider()

                ForEach(AgentMode.allCases) { mode in
                    Button("Mode: \(mode.title)") {
                        Task { await ConversationStore.shared.setMode(mode) }
                    }
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(session)
                .environmentObject(workspace)
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Independent product: do not launch or require Jarvis.
        NSApp.setActivationPolicy(.regular)
        AppSessionStore.shared.bootstrap()
    }


func application(_ application: NSApplication, open urls: [URL]) {
        Task { @MainActor in
            DeepLinkRouter.handle(urls)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

extension Notification.Name {
    static let focusComposer = Notification.Name("ai.supercode.desktop.focusComposer")
    static let openConversation = Notification.Name("ai.supercode.desktop.openConversation")
    static let composerPrefill = Notification.Name("ai.supercode.desktop.composerPrefill")
}
