# Supercode Desktop

Native macOS coding-agent app (SwiftUI) matching the `cmd/desk1.png` shell.

## Product independence

- **Separate download / icon / process** from Jarvis.
- **Does not require Jarvis** to install, launch, or run.
- Talks only to the shared **supercode-cli server** (`/api/user/*`, `/api/conversations/*`, `/api/ai/chat` NDJSON).
- Billed as its own client surface (`X-Supercode-Client: desktop`).
- Optional coexistence with Jarvis is **not** part of v1.

Jarvis remains a standalone Dynamic Island product under `apps/jarvis`.

## Install from a release

Download the verified macOS DMG from the website, open it, drag **Supercode** to **Applications**, eject the disk image, and launch Supercode from Applications. Requires macOS 14+; the universal app supports Apple Silicon and Intel. Users do not need Xcode, Bun, the CLI, or Jarvis. Until a signed release is published, the website shows “Coming soon”.

## Build requirements

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

Server URL defaults by build configuration:

- **Debug** (local Xcode runs): `http://localhost:3004` — start the CLI server with `bun run dev` in `apps/supercode-cli/server`.
- **Release** (packaged / production desktop): `https://supercode-terminal.vercel.app`

Override anytime on the sign-in screen or in Settings (Local / Production presets).

## DMG packaging

Run from `apps/supercode-desktop`:

```bash
bash scripts/package-dmg.sh development 0.1.0 1
```

Creates `dist/Supercode-0.1.0-universal-development.dmg` and its `.sha256` file. It builds Release with both architectures, verifies version/icon/contracts, and includes only the app plus an Applications shortcut. Development packages are ad-hoc signed, **not notarized, and not public releases**. Existing output files are never overwritten. Pass a fourth argument for a different output directory. Build intermediates are temporary and removed automatically.

For local production packaging, install a **Developer ID Application** certificate with its private key into Keychain. Store notarization credentials using the interactive `xcrun notarytool store-credentials desktop-notary` command (do not put passwords in command history). Set `DEVELOPER_ID_APPLICATION` to the certificate identity and `NOTARY_PROFILE=desktop-notary`; optionally set `SIGNING_KEYCHAIN` to the keychain path. Then run:

```bash
bash scripts/package-dmg.sh production 0.1.0 1
```

Production mode requires signing credentials; it does not fall back to development mode. It signs with hardened runtime and a secure timestamp, notarizes and staples the app, then signs/notarizes/staples the DMG and performs Gatekeeper checks before writing the final DMG and checksum. On notarization failure, inspect the submission ID with `notarytool log`; never publish a failed artifact.

## GitHub release setup

Configure the `desktop-production` GitHub environment **before pushing a release tag**. Require reviewer approval, restrict deployment tags to `desktop-v*`, protect release tags from unauthorized creation/replacement, and add these environment secrets securely:

- `DESKTOP_CERTIFICATE_P12_BASE64`: base64-encoded exported Developer ID Application certificate and private key.
- `DESKTOP_CERTIFICATE_PASSWORD`: password protecting that export.
- `DESKTOP_DEVELOPER_ID_APPLICATION`: complete `Developer ID Application: ...` signing identity.
- `DESKTOP_APPLE_ID`: Apple Developer account used for notarization.
- `DESKTOP_APPLE_TEAM_ID`: Apple Developer team ID.
- `DESKTOP_APPLE_APP_PASSWORD`: app-specific Apple password for notarization.

Do not commit these values or paste them into logs/chat. The workflow creates a temporary signing keychain and removes it in an always-run cleanup step; only the release job can access signing secrets. Native pull-request checks and manual branch runs do not use signing credentials.

The `Desktop DMG` workflow runs Debug/Release native tests and universal development packaging. Pushing a reviewed `desktop-vX.Y.Z` tag runs the protected production job and creates a **draft** GitHub Release containing `Supercode-X.Y.Z-universal.dmg` and its checksum. The GitHub run number becomes the app build number. Do not reuse or move published version tags. Keep desktop releases from becoming the repository's generic latest release (the CLI uses that channel).

Before tagging, ensure the native app changes and bundled terminal contracts are committed, reviewed, and compatible with the deployed production API. The workflow can only build committed sources, not local untracked work.

## Publish the website download

After clean-install verification, publish the draft without marking it as the repository's latest release. Set `NEXT_PUBLIC_DESKTOP_DMG_URL` in the Vercel web project's production environment to the exact published asset URL:

```text
https://github.com/yashdev9274/supercli/releases/download/desktop-v0.1.0/Supercode-0.1.0-universal.dmg
```

Redeploy the web app after setting/changing the URL; Next.js embeds this public value at build time. The link validator rejects non-HTTPS, mismatched versions, generic latest links and development artifacts. Missing/invalid configuration keeps the card unavailable. Verify the public DMG and checksum links before enabling them. No binary is stored in the Vercel deployment.

## Release acceptance

On a clean macOS user account/device with no CLI token or developer environment:

1. Download the candidate DMG through a browser and verify its SHA-256 checksum.
2. Install to Applications, eject the DMG, and launch without bypassing Gatekeeper. Confirm the S icon.
3. Complete browser device login against production. The app defaults to public device client ID `ai.supercode.desktop`; no GitHub client secret or developer environment is bundled. The existing server device plugin accepts this ID; any future `validateClient` allowlist must include it.
4. Select a workspace and run a basic model turn plus a permitted local file/command tool. Check denial/cancellation and relaunch persistence.
5. Test on Apple Silicon and Intel hardware; checking the universal binary is not Intel runtime testing.

Signing/notarization, deployed backend compatibility and this live smoke test are mandatory public-release gates. Automated local tests cannot establish those outcomes. This workflow does not deploy the backend or provide automatic in-app updates.

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
