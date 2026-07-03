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

### Voice Input

Voice capture requires `ffmpeg` and an STT provider API key.

| Env Var | Description | Default |
|---|---|---|
| `STT_PROVIDER` | STT provider (`elevenlabs` or `groq`) | `elevenlabs` |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (required for ElevenLabs STT) | — |
| `ELEVENLABS_MODEL` | ElevenLabs model ID | `scribe_v1` |
| `GROQ_API_KEY` | Groq API key (required when `STT_PROVIDER=groq`) | — |
| `STT_LANGUAGE` | Transcription language | `en` |

Press **Ctrl+Shift+V** during a chat session to start voice capture.

## License

MIT
