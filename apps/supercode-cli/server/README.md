# Supercode CLI

AI-powered coding agent that runs in your terminal.

```bash
npm install -g supercode-cli
# or
npx supercode-cli
```

## Quick Start

```bash
# Authenticate with the Supercode server
supercode login

# Start a coding session
supercode init
```

### Login

Runs a device authorization flow — opens your browser to authenticate via GitHub. The session token is stored locally.

### Init

Starts an interactive coding session. You'll be prompted to:

1. Select an AI provider (Google Gemini, MiniMax, OpenRouter, or NVIDIA NIM)
2. Choose a model
3. Pick a mode (Chat, Tools, or Agent)

The AI has access to file reading, searching, web fetching, and code execution tools.

## Configuration

| Env Var | Description | Default |
|---|---|---|
| `SUPERCODE_SERVER_URL` | Supercode server URL | `https://supercode-8w7e.onrender.com` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI API key | — |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `MINIMAX_API_KEY` | MiniMax API key | — |
| `NVIDIA_API_KEY` | NVIDIA NIM API key | — |

### Neon AI Gateway

Requires Node 20.19+. In the CLI, run `/connect` → **Neon AI Gateway**, then supply your branch gateway URL and masked invocation token. Both are session-only; the token is never saved to CLI config. You can also set `NEON_AI_GATEWAY_BASE_URL` and `NEON_AI_GATEWAY_TOKEN` via your environment or secret manager.

Nova uses those same variables on the **terminal harness server**, not in browser storage or `NEXT_PUBLIC_*` variables. Restart the harness after configuring them, then select Neon in Nova's model picker or Settings → Models.

The URL must be the bare HTTPS branch origin from Neon Console → branch → AI Gateway, without `/v1`. The token needs `ai_gateway:invoke`; a Neon management API key will not work. Access requires a funded Neon project and varies by branch. The SDK routes Claude to Messages, OpenAI/Codex to Responses, and other models to Chat Completions. Gemini structured output and multi-step tools are currently unsupported; Responses tool continuations can fail upstream. Nova's normal plan and budget limits still apply.

### Local Codex in Nova

Native Codex subscription login is supported only with **locally hosted Nova**, not the Vercel-hosted UI. Install the OpenAI Codex CLI separately, start Nova locally, then run from the workspace you want Codex to inspect:

```bash
# From this repository (development, no publish required)
bun apps/supercode-cli/server/src/cli/main.ts nova connect --origin http://localhost:3003

# Once the updated CLI is installed
supercode nova connect --origin http://localhost:3003
```

Run `codex login` first if you are not already signed in. The companion defaults to your existing `CODEX_HOME` (or `~/.codex`) and detects the signed-in account through Codex app-server without reading or copying auth files. Keep the same `CODEX_HOME` when running both commands. Confirm the profile/workspace/origin in the terminal. In Nova **Settings → Models → Local Codex**, enter the companion port and single-use code, confirm workspace access, and pair. Your account and models appear automatically; choose **Open local Codex chat**. The browser cannot scan installed binaries directly.

Existing-profile mode cannot sign in, switch accounts or sign out through Nova. Use `codex login` / `codex logout` in the terminal, then restart the companion and pair again. The existing credential-storage backend (including OS keyring) is preserved. Codex itself may renew credentials and write its normal session state.

For a separate Nova account, add `--profile isolated`. This uses `~/.nova-codex` instead, enables **Continue with ChatGPT** and **Sign out of Nova Codex**, and does not reuse the CLI account. Complete sign-in and click **Refresh account & models**. Nova does not install Codex automatically.

This is read-only chat/planning with native follow-up threads, not writable Nova agent tools. Read-only sandboxing does not restrict reads to the selected folder. Only normalized text and terminal events are exposed; unsupported native approval/permission requests are denied. Model catalogs are not entitlement guarantees. Failed/interrupted turns are explicitly incomplete.

The companion binds only `127.0.0.1` (default port `43127`; override with `--port`). It accepts only the exact configured localhost origin and a paired credential. OpenAI credentials stay under Codex's control. Existing mode preserves your configured home and does not change its permissions or credential backend. Your existing Codex configuration may contain hooks, plugins or integrations; this preview does not isolate those. Use `--profile isolated` for a separate profile and avoid adding integrations there. API-key accounts are not supported by this subscription connection. Only one companion should use an isolated profile at a time.

Pairing codes expire in five minutes, are single-use, and permit at most five attempts. Browser session credentials remain in memory for up to one hour. Reloading/navigating away requires restarting the companion and re-pairing. **Unpair** disconnects the browser; **Sign out of Nova Codex** logs out the dedicated profile and does not claim to revoke other OpenAI sessions. Ctrl+C stops the companion. Disconnects, deadline/overflow cancellation, or a failed native interruption may terminate Codex; restart/re-pair to recover.

Browsers may require local-network permission or block HTTPS-to-HTTP loopback connections. Do not work around this by exposing the companion publicly or proxying subscription credentials through Vercel. Current OpenAI documentation directs hosted/commercial integrations to partner-provisioned Sign in with ChatGPT; this native-login path rejects remote origins.

### Voice Input

Voice capture requires `ffmpeg` and a Smallest.ai API key.

| Env Var | Description | Default |
|---|---|---|
| `SMALLEST_API_KEY` | Smallest.ai API key (https://app.smallest.ai/dashboard/api-keys) | — |
| `SMALLEST_MODEL` | Smallest.ai STT model | `pulse-pro` |
| `SMALLEST_LANGUAGE` | Transcription language | `en` |

### Voice Reply (speaks the answer back)

After a voice-triggered turn, supercode reads the assistant's reply aloud using
ElevenLabs TTS when a key is available, otherwise macOS `say`. macOS only.

| Env | Description | Default |
|---|---|---|
| `VOICE_REPLY` | Enable spoken replies (`on`/`off`) | `on` |
| `ELEVENLABS_VOICE_ID` | ElevenLabs TTS voice | `21m00Tcm4TlvDq8ikWAM` |
| `ELEVENLABS_TTS_MODEL` | ElevenLabs TTS model | `eleven_turbo_v2_5` |

Press **Ctrl+V** (or **F2**) during a chat session to start voice capture. The
captured command is run as a normal agent turn, then the reply is spoken back.

## License

MIT
