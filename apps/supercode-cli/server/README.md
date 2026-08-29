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

## Standalone binaries

The CLI can be compiled into standalone executables with Bun. The binaries do
not require Bun or Node.js to be installed on the target machine.

From `apps/supercode-cli/server`:

```bash
# Build all supported macOS and Linux targets
bun run build:binary

# Build only Linux targets
bun run build:binary:linux

# Build only macOS targets
bun run build:binary:macos
```

Artifacts are written to `dist/` as `supercode-<platform>-<architecture>`.
The npm build remains available through `bun run build` and produces
`dist/main.js`.

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
