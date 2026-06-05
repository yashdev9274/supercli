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

## License

MIT
