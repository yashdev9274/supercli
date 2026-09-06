# Supercode Desktop

Native macOS coding-agent app (SwiftUI) matching the `cmd/desk1.png` shell.

## Product independence

- **Separate download / icon / process** from Jarvis.
- **Does not require Jarvis** to install, launch, or run.
- Talks only to the shared **supercode-cli server** (`/api/user/*`, `/api/conversations/*`, `/api/ai/chat` NDJSON).
- Billed as its own client surface (`X-Supercode-Client: desktop`).
- Optional coexistence with Jarvis is **not** part of v1.

Jarvis remains a standalone Dynamic Island product under `apps/jarvis`.

## Requirements

- macOS 14+
- Xcode 16+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)

## Generate & run

```bash
cd apps/supercode-desktop
./scripts/generate.sh
open SupercodeDesktop.xcodeproj
# or:
xcodebuild -scheme SupercodeDesktop -configuration Debug build
```

## Auth

1. **Device login** (browser) — primary path, same Better Auth device flow as the CLI.
2. **Import CLI token** — uses `~/.better-auth/token.json` if you already ran `supercode login`.

Configure server URL on the sign-in screen or in Settings (default: production Render URL; local often `http://localhost:3004`).

## Deep links

URL scheme: `supercode://`

- `supercode://conversation/<id>`
- `supercode://workspace?path=/absolute/path`

## Layout

```
SupercodeDesktop/
  App/           entry + app delegate
  Models/        chat, tools, diffs
  Services/      Keychain + API client (NDJSON stream)
  Stores/        session, workspace, conversations, agent run
  Views/         desk1 shell (sidebar, chat, composer, inspector, auth)
```

## Roadmap hooks (already scaffolded)

- Workspace picker + security-scoped bookmarks + git branch pill
- Diff inspector Accept/Reject (disk apply in later phase via local sidecar)
- Permission request model for local tools
- No Jarvis auto-launch by design
