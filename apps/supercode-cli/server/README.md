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
