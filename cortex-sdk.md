# Cortex SDK

## Overview

A unified TypeScript SDK that wraps 8 AI gateway providers, 3 web search providers, 6 MCP tool platforms, and 3 voice providers — providing a single developer experience for building AI agents that can use any model, search the web, control any software, and speak or listen.

Modeled after the Vercel AI SDK architecture: each capability produces standard Vercel AI SDK types (`LanguageModel`, `Tool`) so they compose naturally with `streamText`, `generateText`, and the broader AI SDK ecosystem.

### Provider Coverage

| Category | Providers |
|---|---|
| **AI Gateways** | ConcentrateAI, MergeDev, OpenRouter, Google Gemini, MiniMax, NVIDIA NIM, OrcaRouter, Supercode Cloud |
| **Web Search** | Exa (semantic search), Firecrawl (search + scrape), Context.dev (scrape + brand + monitor) |
| **MCP / Tool Platforms** | Composio (150+ apps), MergeDev Agent Handler, GitHub MCP, Linear MCP, Slack MCP, Custom user MCP servers |
| **Voice (STT + TTS)** | Smallest.ai (recommended), ElevenLabs, Groq (parked) |

---

## Architecture

```
cortex-sdk (single npm package)
│
├── /gateway          → Unified model access via 8 providers
│                         ConcentrateAI | MergeDev | OpenRouter | Gemini
│                         MiniMax | NVIDIA NIM | OrcaRouter | Supercode Cloud
│
├── /agent-handler    → MCP-native tool packs via MergeDev AH
│
├── /composio         → 150+ app integrations via Composio
│
├── /web-search       → Web search via Exa, Firecrawl, and Context.dev
│                         Exa (semantic) | Firecrawl (search + scrape)
│                         Context.dev (scrape + brand + monitor)
│
├── /mcp              → Direct MCP client connections (GitHub, Linear, Slack, custom)
│
├── /voice            → Voice synthesis and recognition
│                         STT: Smallest.ai (recommended) | ElevenLabs | Groq (parked)
│                         TTS: Smallest.ai (recommended) | ElevenLabs
│
└── (root)            → High-level SupercodeAgent combining all modules
```

### Design Principle

Each sub-module returns **Vercel AI SDK-native types** and provides **discovery + selection** methods:

| Module | Returns | Also Provides |
|---|---|---|
| `createGateway()` | `LanguageModel` | `listModels()` — discover available models per provider |
| `agentHandler.getTools()` | `Record<string, Tool>` | `listToolPacks()`, `selectPacks()` — discover & choose packs |
| `composioClient.getTools()` | `Record<string, Tool>` | `listApps()`, `connectApp()`, `selectApps()` — discover & connect apps |
| `createWebSearch()` | `Record<string, Tool>` | `search(query)`, `scrape(url)`, `listProviders()` — web search via Exa, Firecrawl, or Context.dev |
| `createMcpClient()` | `Record<string, Tool>` | `listServers()`, `connectServer()` — connect to GitHub/Linear/Slack/custom MCP servers |
| `voice.stt()` | `string` (transcript) | `transcribe(audio)` — speech-to-text |
| `voice.tts()` | `Buffer` (audio) | `synthesize(text, voice)` — text-to-speech |

---

## Package Structure

```
packages/cortex-sdk/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
│
└── src/
    ├── index.ts                       # Re-exports + SupercodeAgent class
    │
    ├── core/
    │   ├── types.ts                   # Shared config interfaces
    │   └── errors.ts                  # SdkError, ConnectionError, AuthError, etc.
    │
    ├── gateway/
    │   ├── index.ts                   # createGateway(options) → LanguageModel
    │   ├── types.ts                   # GatewayProvider, GatewayOptions, ModelInfo
    │   ├── base.ts                    # Abstract BaseGatewayProvider with retry/timeout
    │   ├── concentrateai.ts           # @ai-sdk/openai-compatible wrapper
    │   ├── mergedev.ts                # @ai-sdk/openai-compatible wrapper
    │   ├── openrouter.ts              # Raw fetch SSE (OpenAI-compatible, no SDK)
    │   ├── gemini.ts                  # @ai-sdk/google wrapper
    │   ├── minimax.ts                 # vercel-minimax-ai-provider wrapper
    │   ├── nim.ts                     # @ai-sdk/openai-compatible for NVIDIA NIM
    │   ├── orcarouter.ts              # @ai-sdk/openai-compatible wrapper
    │   └── supercode-cloud.ts         # Server-proxied gateway via /api/v1/gateway
    │
    ├── agent-handler/
    │   ├── index.ts                   # createAgentHandler(options) → AgentHandlerClient
    │   ├── types.ts                   # AgentHandlerConfig, ToolPackInfo
    │   ├── client.ts                  # MCP connect/disconnect/listTools via @ai-sdk/mcp
    │   └── tool-packs.ts              # Preset configurations for known tool packs
    │
    ├── composio/
    │   ├── index.ts                   # createComposio(options) → ComposioClient
    │   ├── types.ts                   # ComposioConfig, AppInfo, ConnectionStatus
    │   ├── session.ts                 # Session create/recreate (local SDK or server-proxied)
    │   ├── apps.ts                    # listApps, connectApp (OAuth), getTools
    │   └── oauth.ts                   # Browser redirect + poll flow
    │
    ├── web-search/
    │   ├── index.ts                   # createWebSearch(options) → WebSearchClient
    │   ├── types.ts                   # WebSearchConfig, WebSearchProvider, SearchResult
    │   ├── exa.ts                     # Exa web search (via MCP or REST)
    │   ├── firecrawl.ts               # Firecrawl web search + scrape (via MCP or REST)
    │   └── contextdev.ts              # Context.dev scrape + brand + monitor (via REST SDK)
    │
    ├── mcp/
    │   ├── index.ts                   # createMcpManager(options) → McpManager
    │   ├── types.ts                   # McpServerConfig, McpConnection
    │   ├── manager.ts                 # Connect/disconnect/list tools for all servers
    │   ├── github.ts                  # GitHub MCP server connection
    │   ├── linear.ts                  # Linear MCP server connection
    │   ├── slack.ts                   # Slack MCP server connection
    │   └── custom.ts                  # User-defined custom MCP server connections
    │
    ├── voice/
    │   ├── index.ts                   # createVoice(options) → VoiceClient
    │   ├── types.ts                   # VoiceConfig, SttProvider, TtsProvider
    │   ├── smallest.ts                # Smallest.ai STT (pulse-pro) + TTS (lightning_v3.1_pro)
    │   ├── elevenlabs.ts              # ElevenLabs STT (scribe_v1, legacy) + TTS (eleven_turbo_v2_5)
    │   ├── groq.ts                    # Groq STT (whisper-large-v3-turbo, parked)
    │   ├── stt.ts                     # Speech-to-text dispatcher
    │   └── tts.ts                     # Text-to-speech dispatcher
    │
    └── utils/
        ├── retry.ts                   # Exponential backoff (3 attempts, 1s/2s/4s)
        └── fetch.ts                   # Fetch wrapper with auth and error normalization
```

---

## API Surface

### Level 1 — Models Only

```typescript
import { createGateway } from "cortex-sdk/gateway"

// ConcentrateAI — OpenAI-compatible gateway
const gateway = createGateway({
  provider: "concentrateai",
  apiKey: "sk-cn-...",
  model: "deepseek/deepseek-v4-flash",    // optional, sets default model
})

// Discover available models for the selected provider
const models = await gateway.listModels()
// Returns [{ id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", ... }, ...]

// Select a model (returns LanguageModel)
const model = gateway.model("deepseek/deepseek-v4-flash")

// MergeDev — same interface, different provider
const mdGateway = createGateway({
  provider: "mergedev",
  apiKey: "md-...",
  model: "anthropic/claude-sonnet-4-6",
})

// OpenRouter — raw fetch SSE, no SDK dependency
const orGateway = createGateway({
  provider: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "anthropic/claude-sonnet-4",
})

// Google Gemini — via @ai-sdk/google
const geminiGateway = createGateway({
  provider: "gemini",
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  model: "gemini-2.5-pro",
})

// MiniMax — via vercel-minimax-ai-provider
const mmGateway = createGateway({
  provider: "minimax",
  apiKey: process.env.MINIMAX_API_KEY,
  model: "MiniMax-M1",
})

// NVIDIA NIM — via @ai-sdk/openai-compatible
const nimGateway = createGateway({
  provider: "nim",
  apiKey: process.env.NVIDIA_API_KEY,
  model: "nvidia/llama-3.3-nemotron-super-49b-v1",
})

// OrcaRouter — via @ai-sdk/openai-compatible
const orcaGateway = createGateway({
  provider: "orcarouter",
  apiKey: process.env.ORCAROUTER_API_KEY,
  model: "openai/gpt-4o",
})

// Supercode Cloud — server-proxied, no client-side key needed
const scGateway = createGateway({
  provider: "supercode-cloud",
})

// Works directly with Vercel AI SDK
import { streamText } from "ai"

const result = streamText({
  model: gateway.model,  // or gateway.model("deepseek/deepseek-v4-flash")
  messages: [{ role: "user", content: "Write a poem" }],
})
```

**`createGateway()` returns a gateway client** with `listModels()` for discovery and `.model` (getter, uses constructor-specified model) / `.model(id)` (selector, returns a standard Vercel AI SDK `LanguageModel`). Swappable between providers with one config change. Each provider uses its optimal transport: OpenAI-compatible SDK for ConcentrateAI/MergeDev/NIM/OrcaRouter, raw fetch SSE for OpenRouter, native SDKs for Gemini/MiniMax.

### Level 2 — Models + Tools (Agent Handler)

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createAgentHandler } from "cortex-sdk/agent-handler"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

const handler = createAgentHandler({
  apiKey: process.env.MERGE_AH_API_KEY,
  registeredUserId: process.env.MERGE_REGISTERED_USER_ID,
})

// Discover available tool packs
const packs = await handler.listToolPacks()
// Returns [{ id: "web-search", name: "Web Search", tools: ["firecrawl_search", ...] }, ...]

// Select which packs to connect
await handler.selectPacks(["web-search", "exa-search"])

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Search the web for latest AI news" }],
  tools: await handler.getTools(),  // MCP tools from selected packs
})
```

**`createAgentHandler()` wraps MergeDev's Agent Handler MCP endpoint.** Provides `listToolPacks()` for discovery and `selectPacks()` for choosing which packs to activate. Under the hood it uses `@ai-sdk/mcp` with HTTP transport to connect to `https://ah-api.merge.dev/api/v1/tool-packs/{toolPackId}/registered-users/{registeredUserId}/mcp`. Tools are returned as `Record<string, Tool>` — directly passable to `streamText`.

### Level 2b — Models + Tools (Web Search — Exa / Firecrawl / Context.dev)

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createWebSearch } from "cortex-sdk/web-search"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

// Exa — semantic web search
const exaSearch = createWebSearch({
  provider: "exa",
  apiKey: process.env.EXA_API_KEY,
})

// Firecrawl — search + scrape
const firecrawlSearch = createWebSearch({
  provider: "firecrawl",
  apiKey: process.env.FIRECRAWL_API_KEY,
})

// Context.dev — scrape + brand intelligence + monitoring
const contextDevSearch = createWebSearch({
  provider: "contextdev",
  apiKey: process.env.CONTEXTDEV_API_KEY,
})

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Find the latest pricing for Vercel's Pro plan" }],
  tools: await exaSearch.getTools(),  // { web_search_exa, web_fetch_exa }
})
```

**`createWebSearch()` wraps Exa, Firecrawl, or Context.dev web search capabilities.** Returns `Record<string, Tool>` for use with Vercel AI SDK.

- **Exa**: Semantic search via MCP endpoint (`web_search_exa`, `web_fetch_exa`)
- **Firecrawl**: Search + scraping via MCP endpoint (`firecrawl_search`, `firecrawl_scrape`, `firecrawl_crawl`)
- **Context.dev**: Scrape + brand + monitor via REST SDK (`web_scrape`, `web_search`, `web_extract`, `web_crawl`, `get_brand`, `create_monitor`)

### Level 3 — Models + Tools (Composio)

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createComposio } from "cortex-sdk/composio"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "concentrateai",
  apiKey: process.env.CONCENTRATEAI_API_KEY,
})

const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,          // for local SDK mode
  // OR serverUrl for proxied mode (no local composio key needed)
})

// Discover available apps
const apps = await composio.listApps()
// Returns [{ slug: "github", name: "GitHub", connected: false }, ...]

// Connect (OAuth) then use — individual app
await composio.connectApp("github")

// Or batch-select multiple apps at once
await composio.selectApps(["github", "linear", "slack"])

const result = streamText({
  model: gateway.model("anthropic/claude-opus-4-8"),
  messages: [{ role: "user", content: "Create a GitHub issue and post in Slack" }],
  tools: await composio.getTools(),  // MCP tools from connected apps
})
```

**`createComposio()` abstracts `@composio/core` behind a clean interface.** Two modes:
- **Local SDK mode**: Uses `@composio/core` directly with `COMPOSIO_API_KEY`
- **Server-proxied mode**: Calls a remote server's `POST /api/composio/session` endpoint (no local composio key needed)

### Level 3b — Models + Tools (Direct MCP)

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createMcpManager } from "cortex-sdk/mcp"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

const mcp = createMcpManager({
  servers: [
    { id: "github", type: "github", token: process.env.GITHUB_TOKEN },
    { id: "linear", type: "linear", token: process.env.LINEAR_API_KEY },
    { id: "slack", type: "slack", token: process.env.SLACK_BOT_TOKEN },
    { id: "custom-1", type: "custom", url: "http://localhost:3001/mcp" },
  ],
})

// Connect all servers
await mcp.connectAll()

// List tools from a specific server
const githubTools = await mcp.listTools("github")

// Get all tools merged
const allTools = mcp.getTools()

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Create a GitHub issue" }],
  tools: allTools,
})
```

**`createMcpManager()` connects directly to MCP servers** — GitHub, Linear, Slack, or any custom server. Returns tools as `Record<string, Tool>` for use with Vercel AI SDK. No OAuth flow needed for token-based servers (GitHub PAT, Linear API key, Slack bot token).

### Level 4 — SupercodeAgent (All-in-One)

```typescript
import { SupercodeAgent } from "cortex-sdk"

const agent = new SupercodeAgent({
  gateway: {
    provider: "mergedev",
    apiKey: process.env.MERGE_DEV_API_KEY,
    model: "anthropic/claude-sonnet-4-6",          // optional, defaults to provider's best
  },
  agentHandler: {
    apiKey: process.env.MERGE_AH_API_KEY,
    registeredUserId: process.env.MERGE_REGISTERED_USER_ID,
    toolPacks: ["web-search", "exa-search"],        // select packs at init
  },
  composio: {
    apiKey: process.env.COMPOSIO_API_KEY,
    apps: ["github", "linear", "slack"],             // select apps at init
  },
  webSearch: {
    provider: "exa",                                // or "firecrawl" or "contextdev"
    apiKey: process.env.EXA_API_KEY,
  },
  mcp: {
    servers: [
      { id: "github", type: "github", token: process.env.GITHUB_TOKEN },
      { id: "linear", type: "linear", token: process.env.LINEAR_API_KEY },
    ],
  },
  voice: {
    stt: "smallest",                                // or "elevenlabs"
    tts: "smallest",                                // or "elevenlabs"
  },
})

await agent.init()
// Connects: gateway → model selected
//           agent handler → selected tool packs connected
//           composio → selected apps connected (OAuth if needed)
//           mcp → all MCP servers connected
//           voice → STT + TTS providers initialized

// Orchestration only — consumer drives the AI SDK
import { streamText } from "ai"

const result = streamText({
  model: agent.model,
  messages: [{ role: "user", content: "Review last week's Mercury transactions and create a GitHub issue" }],
  tools: { ...agent.tools },
})

// Voice capabilities
const transcript = await agent.voice.stt(audioBuffer)
const audio = await agent.voice.tts("Hello, world!")
```

**`SupercodeAgent` is an orchestration layer only** — it handles initialization and state (connecting all services, managing sessions, merging tools). The consumer is free to use `streamText`, `generateText`, or any other AI SDK function with the agent's `.model`, `.tools`, and `.voice`.

---

## Underlying Technology

### AI Gateway Providers

#### ConcentrateAI

- **API Base URL**: `https://api.concentrate.ai/v1`
- **Auth**: Bearer token (`Authorization: Bearer <key>`)
- **API Format**: OpenAI-compatible (`/v1/chat/completions`)
- **Key env vars**: `CONCENTRATEAI_API_KEY`, `CONCENTRATE_BYOK_PROD_KEY`, `CONCENTRATE_BYOK_DEV_KEY`
- **Models available**: Claude Opus 4.8, Claude Sonnet 4.5/4, GPT-4o, GPT-4.1, o3-mini, o4-mini, Grok 4.5/3, DeepSeek V4 Flash/V3/R1, Llama 4 Maverick, GLM 5.2, Kimi K3/K2.6, MiniMax M3, and more
- **Value prop**: Access to 20+ frontier models through a single API without managing 20 separate provider keys

#### MergeDev Gateway

- **API Base URL**: `https://api-gateway.merge.dev/v1/openai`
- **Auth**: Bearer token
- **API Format**: OpenAI-compatible
- **Key env vars**: `MERGE_DEV_API_KEY`, `MERGE_DEV_BYOK_PROD_KEY`, `MERGE_DEV_BYOK_DEV_KEY`
- **Models available**: Claude Sonnet 4.6, Claude Opus 4.8/4, GPT-4o/o3/o4, Grok 4.3/4.5, Gemini 2.5 Flash/Pro, DeepSeek V4 Flash/V3/R1, Llama 4 Maverick, Kimi K3/K2.6, MiniMax M3, and more
- **Value prop**: Unified billing + access to frontier models through one gateway

#### OpenRouter

- **API Base URL**: `https://openrouter.ai/api/v1`
- **Auth**: Bearer token (`Authorization: Bearer sk-or-...`)
- **API Format**: OpenAI-compatible, but uses raw `fetch()` + SSE parsing (no SDK wrapper)
- **Key env vars**: `OPENROUTER_API_KEY`
- **Features**: `OPENROUTER_FALLBACK_ENABLED`, `OPENROUTER_AUTO_SELECT`, `OPENROUTER_FORCE_PROVIDER`, `OPENROUTER_PROVIDER_PREFERENCE`
- **Models available**: 200+ models from all major providers (Anthropic, OpenAI, Google, Meta, Mistral, etc.)
- **Value prop**: Largest model catalog, automatic fallback between providers, cost optimization

#### Google Gemini

- **SDK**: `@ai-sdk/google` (native Vercel AI SDK provider)
- **Auth**: Google API key
- **Key env vars**: `GOOGLE_GENERATIVE_AI_API_KEY`
- **Models available**: Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 2.0 Flash-Lite
- **Value prop**: Native Vercel AI SDK support, Google ecosystem integration, competitive pricing

#### MiniMax

- **SDK**: `vercel-minimax-ai-provider` (community Vercel AI SDK provider)
- **Auth**: MiniMax API key
- **Key env vars**: `MINIMAX_API_KEY`
- **Models available**: MiniMax-M1, MiniMax-Text-01
- **Value prop**: Strong performance on reasoning tasks, competitive pricing

#### NVIDIA NIM

- **SDK**: `@ai-sdk/openai-compatible` (NVIDIA NIM exposes OpenAI-compatible API)
- **Auth**: NVIDIA API key
- **Key env vars**: `NVIDIA_API_KEY`
- **Models available**: `nvidia/llama-3.3-nemotron-super-49b-v1`, `nvidia/llama-3.1-nemotron-70b-instruct`
- **Value prop**: Enterprise-grade inference, GPU-optimized models

#### OrcaRouter

- **SDK**: `@ai-sdk/openai-compatible`
- **Auth**: OrcaRouter API key
- **Key env vars**: `ORCAROUTER_API_KEY`
- **Models available**: Routed access to OpenAI, Anthropic, Google, and other models
- **Value prop**: Intelligent routing, cost optimization, fallback handling

#### Supercode Cloud

- **API Base URL**: Server-proxied via `POST /api/v1/gateway`
- **Auth**: Session-based (stored auth token)
- **Key env vars**: None (uses existing auth)
- **Models available**: Inherits from ConcentrateAI gateway
- **Value prop**: Zero-config for CLI users, no API key management needed

### Web Search Providers

#### Exa

- **MCP URL**: `https://mcp.exa.ai/mcp`
- **REST API**: `https://api.exa.ai`
- **Auth**: API key via `x-api-key` header
- **Key env vars**: `EXA_API_KEY`
- **Key tools**: `web_search_exa`, `web_fetch_exa`, `web_search_advanced_exa`, `agent_run`
- **Value prop**: Semantic web search optimized for LLMs, category filtering (company, publication, news, people)

#### Firecrawl

- **MCP URL**: `https://mcp.firecrawl.dev/v2/mcp`
- **REST API**: `https://api.firecrawl.dev`
- **Auth**: API key via `Authorization: Bearer fc-...`
- **Key env vars**: `FIRECRAWL_API_KEY`
- **Key tools**: `firecrawl_search`, `firecrawl_scrape`, `firecrawl_crawl`, `firecrawl_extract`, `firecrawl_map`, `firecrawl_batch_scrape`, `firecrawl_deep_research`, `firecrawl_agent`, `firecrawl_interact`
- **Value prop**: All-in-one web toolkit — search + scrape + crawl + extract + monitor

#### Context.dev

- **SDK**: `context.dev` (npm package, typed TypeScript client)
- **REST API**: `https://api.context.dev`
- **Auth**: Bearer token (`Authorization: Bearer ctxt_secret_...`)
- **Key env vars**: `CONTEXTDEV_API_KEY`
- **Key endpoints**: `/v1/web/scrape`, `/v1/web/crawl`, `/v1/web/search`, `/v1/web/extract`, `/v1/parse`, `/v1/brand/{domain}`, `/v1/monitors/*`
- **Value prop**: Unified web context API — scraping, crawling, brand intelligence, and monitoring via single REST integration. Clean markdown/HTML output, automatic bot detection and proxy escalation.

### MCP / Tool Platforms

#### MergeDev Agent Handler (AH)

- **API Base URL**: `https://ah-api.merge.dev`
- **MCP Endpoint**: `https://ah-api.merge.dev/api/v1/tool-packs/{toolPackId}/registered-users/{registeredUserId}/mcp`
- **Auth**: Bearer token via `Authorization` header
- **Key env vars**: `MERGE_AH_API_KEY`, `MERGE_TOOL_PACK_ID`, `MERGE_REGISTERED_USER_ID`
- **Transport**: MCP over HTTP/SSE (via `@ai-sdk/mcp`)
- **Value prop**: MCP-based tool packs (Firecrawl, Exa, etc.) that agents can use to interact with external services

#### Composio

- **SDK**: `@composio/core` (optional peer dependency)
- **Session**: `composio.sessions.create(userId, { mcp: true, connectedAccounts })` → returns MCP proxy URL + headers
- **App Connection**: `composio.toolkits.authorize(userId, slug)` → OAuth redirect URL + `waitForConnection()` polling
- **Key env vars**: `COMPOSIO_API_KEY`, `SUPERCODE_SERVER_URL` (for proxied mode)
- **Transport**: MCP over HTTP/SSE (via `@ai-sdk/mcp`)
- **Value prop**: 150+ pre-built app integrations (GitHub, Linear, Slack, Mercury, Notion, Jira, etc.) — one OAuth flow per app, tools auto-discovered

#### GitHub MCP

- **Server URL**: `https://api.githubcopilot.com/mcp` (official GitHub MCP server)
- **Auth**: GitHub Personal Access Token (PAT) via `Authorization: Bearer <token>`
- **Transport**: MCP over HTTP/SSE (via `@ai-sdk/mcp`)
- **Key env vars**: `GITHUB_TOKEN`
- **Value prop**: Direct access to GitHub API (repos, issues, PRs, code search) via MCP tools

#### Linear MCP

- **Server URL**: `https://mcp.linear.app/sse` (official Linear MCP server)
- **Auth**: Linear API key via `Authorization: Bearer <key>`
- **Transport**: MCP over SSE (via `@ai-sdk/mcp`)
- **Key env vars**: `LINEAR_API_KEY`
- **Value prop**: Direct access to Linear API (issues, projects, teams) via MCP tools

#### Slack MCP

- **Server URL**: Custom (user-deployed or self-hosted)
- **Auth**: Slack Bot Token via `Authorization: Bearer <token>`
- **Transport**: MCP over HTTP/SSE (via `@ai-sdk/mcp`)
- **Key env vars**: `SLACK_BOT_TOKEN`
- **Value prop**: Direct access to Slack API (channels, messages, files) via MCP tools

#### Custom MCP Servers

- **Server URL**: User-provided URL
- **Auth**: User-provided token or headers
- **Transport**: MCP over HTTP/SSE (via `@ai-sdk/mcp`)
- **Key env vars**: User-defined
- **Value prop**: Any MCP-compatible server can be connected

### Voice Providers

#### Smallest.ai (Recommended)

- **STT API**: `POST https://api.smallest.ai/v1/speech-to-text/transcribe` (OpenAI-compatible endpoint)
- **STT Model**: `pulse-pro` (default, best accuracy) or `pulse` (faster)
- **TTS API**: `POST https://api.smallest.ai/v1/lightning/speech-synthesis` (streaming, PCM 24kHz)
- **TTS Model**: `lightning_v3.1_pro`
- **Auth**: Bearer token via `Authorization: Bearer <key>`
- **Key env vars**: `SMALLEST_AI_API_KEY`, `SMALLEST_AI_STT_MODEL` (default: `pulse-pro`), `SMALLEST_AI_TTS_MODEL` (default: `lightning_v3.1_pro`), `STT_LANGUAGE` (default: `en`)
- **Value prop**: Fast, accurate, cost-effective, OpenAI-compatible STT endpoint

#### ElevenLabs

- **STT API**: `POST https://api.elevenlabs.ai/v1/speech-to-text` (requires `model_id: "scribe_v1"`)
- **STT Model**: `scribe_v1` (legacy, not recommended)
- **TTS API**: `POST https://api.elevenlabs.ai/v1/text-to-speech/{voice_id}/stream` (streaming MP3)
- **TTS Model**: `eleven_turbo_v2_5`
- **Auth**: Bearer token via `xi-api-key` header
- **Key env vars**: `ELEVENLABS_API_KEY`, `ELEVENLABS_STT_MODEL` (default: `scribe_v1`), `ELEVENLABS_TTS_MODEL` (default: `eleven_turbo_v2_5`), `ELEVENLABS_VOICE_ID`
- **Value prop**: High-quality TTS voices, natural-sounding speech

#### Groq (Parked)

- **STT API**: `POST https://api.groq.com/openai/v1/audio/transcriptions` (OpenAI-compatible endpoint)
- **STT Model**: `whisper-large-v3-turbo`
- **Auth**: Bearer token via `Authorization: Bearer <key>`
- **Key env vars**: `GROQ_API_KEY`
- **Status**: Parked — no active usage in codebase, kept for potential future use
- **Value prop**: Fast inference, OpenAI-compatible API

### Vercel AI SDK (peer dependency)

- **Package**: `ai` (v4, v5, or v6 — peer dependency, consumer-controlled version)
- **Used by**: Gateway (returns `LanguageModel`), Agent Handler + Composio + MCP (return `Record<string, Tool>`), Voice (returns audio buffers)
- **Value prop**: The SDK composes with the `ai` ecosystem rather than reinventing it

---

## Key Behaviors

### Retry Logic

All gateway providers include exponential backoff retry (inherited from the existing codebase):
- 3 retry attempts for 5xx errors
- Delays: 1s, 2s, 4s
- Abort safety timeout: 120s on all streaming requests

### Empty-Stream Fallback

If a streaming response produces zero content (known edge case with ConcentrateAI's upstream), the SDK automatically retries with a non-streaming request (`"stream": false`).

### OpenRouter Fallback Chain

OpenRouter includes automatic fallback logic:
- `OPENROUTER_FALLBACK_ENABLED` — enables automatic model fallback
- `OPENROUTER_AUTO_SELECT` — auto-selects best model based on cost/performance
- `OPENROUTER_FORCE_PROVIDER` — forces a specific provider
- `OPENROUTER_PROVIDER_PREFERENCE` — preferred provider order

### Tool Loop Guards

- Max 8 tool-call steps per turn (`stepCountIs(8)`)
- Empty-result sentinel injection (hallucination prevention)
- Repetition detection (same tool + same args 3+ times → stops)

### Session Lifecycle (Composio)

- `connect()` → creates/reuses MCP session
- `connectApp(slug)` → OAuth flow → session is recreated to include the new app's tools
- `disconnect()` → tears down MCP connection
- Two modes: local SDK (direct `@composio/core`) or server-proxied (via remote API)

### MCP Server Lifecycle

- `connectServer(id)` → connects to a single MCP server
- `connectAll()` → connects to all configured servers
- `disconnectServer(id)` → disconnects from a single server
- `disconnectAll()` → disconnects from all servers
- Auto-reconnect on connection loss (configurable)

### Web Search Lifecycle

```typescript
// Web Search lifecycle
// Exa: MCP-based, tools returned as Record<string, Tool>
const exa = createWebSearch({ provider: "exa", apiKey: "..." })
await exa.connect()                    // connects to Exa MCP
const exaTools = exa.getTools()        // { web_search_exa, web_fetch_exa }
await exa.disconnect()

// Firecrawl: MCP-based, tools returned as Record<string, Tool>
const firecrawl = createWebSearch({ provider: "firecrawl", apiKey: "..." })
await firecrawl.connect()              // connects to Firecrawl MCP
const fcTools = firecrawl.getTools()   // { firecrawl_search, firecrawl_scrape, ... }
await firecrawl.disconnect()

// Context.dev: REST-based, direct API calls
const ctx = createWebSearch({ provider: "contextdev", apiKey: "..." })
const markdown = await ctx.scrape("https://example.com")
const brand = await ctx.getBrand("example.com")
const results = await ctx.search("latest AI news")
```

### Voice STT/TTS Lifecycle

- **STT**: `transcribe(audio)` → sends audio buffer → returns transcript string
  - Smallest.ai: OpenAI-compatible endpoint, supports language detection
  - ElevenLabs: Requires `model_id: "scribe_v1"` in request body
- **TTS**: `synthesize(text, voice?)` → sends text → returns audio buffer (PCM 24kHz for Smallest, MP3 for ElevenLabs)
  - Streaming supported for both providers
  - Voice ID selection for ElevenLabs via `ELEVENLABS_VOICE_ID`

### BYOK (Bring Your Own Key) Fallback Chain

Both ConcentrateAI and MergeDev gateways support user-provided keys that override the default server key:

```
PROD_BYOK > DEV_BYOK > API_KEY (env)
```

### Gateway Fallback Chain

When primary gateway is unavailable, SupercodeAgent can fall back:
- ConcentrateAI → Supercode Cloud (server-proxied)
- MergeDev → Supercode Cloud (server-proxied)
- OpenRouter → any other configured gateway

---

## package.json

```jsonc
{
  "name": "cortex-sdk",
  "version": "0.1.0",
  "description": "Unified SDK for building AI agents with 8 gateway providers, 3 web search providers, 6 MCP platforms, and 3 voice providers",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./gateway": {
      "types": "./dist/gateway/index.d.ts",
      "import": "./dist/gateway/index.js"
    },
    "./agent-handler": {
      "types": "./dist/agent-handler/index.d.ts",
      "import": "./dist/agent-handler/index.js"
    },
    "./composio": {
      "types": "./dist/composio/index.d.ts",
      "import": "./dist/composio/index.js"
    },
    "./web-search": {
      "types": "./dist/web-search/index.d.ts",
      "import": "./dist/web-search/index.js"
    },
    "./mcp": {
      "types": "./dist/mcp/index.d.ts",
      "import": "./dist/mcp/index.js"
    },
    "./voice": {
      "types": "./dist/voice/index.d.ts",
      "import": "./dist/voice/index.js"
    }
  },
  "files": ["dist"],
  "peerDependencies": {
    "ai": "^4.0.0 || ^5.0.0 || ^6.0.0"
  },
  "dependencies": {
    "@ai-sdk/openai-compatible": "^2.0.0",
    "@ai-sdk/google": "^0.2.0",
    "@ai-sdk/mcp": "^2.0.0",
    "vercel-minimax-ai-provider": "^0.2.0",
    "context.dev": "^1.0.0",
    "zod": "^3.25.0"
  },
  "optionalDependencies": {
    "@composio/core": "^0.13.0",
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

---

## Implementation Phases

### Phase 1 — Scaffold

**Goal**: Package structure, build pipeline, core types.

Files to create:
- `packages/cortex-sdk/package.json` — name, exports map, deps, peer deps
- `packages/cortex-sdk/tsconfig.json` — strict mode, ESNext target, path aliases
- `packages/cortex-sdk/tsup.config.ts` — ESM + CJS outputs, dts generation
- `packages/cortex-sdk/src/core/types.ts` — `GatewayProvider`, `GatewayOptions`, `AgentHandlerConfig`, `ComposioConfig`, `McpServerConfig`, `VoiceConfig`
- `packages/cortex-sdk/src/core/errors.ts` — `SdkError`, `ConnectionError`, `AuthError`, `ModelUnavailableError`, `ToolPackError`
- Register in root `turbo.json` for `build`/`typecheck`/`lint` pipelines
- Verify: `bun run build` produces valid `dist/` with `.js` + `.d.ts` + `.cjs`

### Phase 2 — Gateway Implementation

**Goal**: `createGateway()` working for ConcentrateAI, MergeDev, OpenRouter, Gemini, MiniMax, NVIDIA NIM, OrcaRouter, and Supercode Cloud.

Files to create:
- `src/gateway/base.ts` — Abstract `BaseGatewayProvider` with:
  - Retry logic (3 attempts, 1s/2s/4s backoff)
  - 120s abort safety timeout
  - Empty-stream → non-streaming fallback
  - Usage/cost tracking hooks (optional)
  - Error normalization
- `src/gateway/concentrateai.ts` — `createConcentrateAIProvider(options): BaseGatewayProvider`
  - Wraps `createOpenAICompatible({ baseURL: "https://api.concentrate.ai/v1", headers })`
  - Returns model via `.chatModel(name)`
  - BYOK fallback chain: `CONCENTRATE_BYOK_PROD_KEY` → `CONCENTRATE_BYOK_DEV_KEY` → `CONCENTRATEAI_API_KEY`
- `src/gateway/mergedev.ts` — `createMergeDevProvider(options): BaseGatewayProvider`
  - Same pattern but points at `https://api-gateway.merge.dev/v1/openai`
  - BYOK fallback: `MERGE_DEV_BYOK_PROD_KEY` → `MERGE_DEV_BYOK_DEV_KEY` → `MERGE_DEV_API_KEY`
- `src/gateway/openrouter.ts` — `createOpenRouterProvider(options): BaseGatewayProvider`
  - Raw `fetch()` + SSE parsing (no SDK wrapper)
  - Supports `OPENROUTER_FALLBACK_ENABLED`, `OPENROUTER_AUTO_SELECT`, `OPENROUTER_FORCE_PROVIDER`, `OPENROUTER_PROVIDER_PREFERENCE`
- `src/gateway/gemini.ts` — `createGeminiProvider(options): BaseGatewayProvider`
  - Wraps `@ai-sdk/google` provider
- `src/gateway/minimax.ts` — `createMiniMaxProvider(options): BaseGatewayProvider`
  - Wraps `vercel-minimax-ai-provider`
- `src/gateway/nim.ts` — `createNimProvider(options): BaseGatewayProvider`
  - Wraps `@ai-sdk/openai-compatible` with NVIDIA NIM base URL
- `src/gateway/orcarouter.ts` — `createOrcaRouterProvider(options): BaseGatewayProvider`
  - Wraps `@ai-sdk/openai-compatible` with OrcaRouter base URL
- `src/gateway/supercode-cloud.ts` — `createSupercodeCloudProvider(options): BaseGatewayProvider`
  - Server-proxied via `POST /api/v1/gateway`
  - No client-side API key needed
- `src/gateway/index.ts` — `createGateway(options): GatewayClient`
  - Routes to the correct provider based on `options.provider`
  - Returns `{ model(id?): LanguageModel, listModels(): ModelInfo[] }`
  - `listModels()` discovers available models from the provider
  - `model(id)` returns a standard Vercel AI SDK `LanguageModel` for the given (or default) model

Testing:
- Unit tests with mocked `fetch` verifying retry behavior, auth headers, model creation
- Verify `createGateway()` output is usable with `streamText` from `ai`

### Phase 3 — Agent Handler Implementation

**Goal**: `createAgentHandler()` working with MergeDev AH MCP endpoint.

Files to create:
- `src/agent-handler/client.ts` — MCP client lifecycle:
  - `connect()` → `createMCPClient({ transport: { type: "http" | "sse", url, headers } })` via `@ai-sdk/mcp`
  - `getTools()` → calls `client.tools()` → returns `Record<string, Tool>`
  - `disconnect()` → closes the MCP client
  - `reconnect()` → disconnect + connect
- `src/agent-handler/tool-packs.ts` — Tool pack management:
  - `listToolPacks()` — queries MergeDev AH API for available tool packs
  - `selectPacks(ids[])` — connects only to the selected packs (filters available tools)
  - Predefined preset configs for known tool packs
- `src/agent-handler/index.ts` — `createAgentHandler(config): AgentHandlerClient`
  - Accepts `{ apiKey, registeredUserId }` (toolPackId moved to selectPacks)
  - Returns `{ connect, disconnect, getTools, listToolPacks, selectPacks, isConnected }`

Testing:
- Unit tests with a mock MCP server
- Test connection lifecycle, tool discovery, error handling

### Phase 4 — Composio Implementation

**Goal**: `createComposio()` with app connection and tool discovery.

Files to create:
- `src/composio/session.ts` — Session manager:
  - **Local mode**: Uses `@composio/core` if `COMPOSIO_API_KEY` is present
    - `new Composio({ apiKey }).sessions.create(userId, { mcp: true, connectedAccounts })`
    - Returns `{ url, headers, sessionId }` for MCP connection
  - **Proxied mode**: Calls remote server's `/api/composio/session` endpoint
    - Uses stored auth token for authentication
    - Server creates and returns MCP session info
  - Session caching and recreation after new app connections
- `src/composio/apps.ts` — App management:
  - `listApps()` → queries auth configs, toolkits, and connected accounts → returns merged app list with connection status
  - `connectApp(slug)` → calls `composio.toolkits.authorize()` → opens browser for OAuth → polls until active
  - `selectApps(slugs[])` → batch-connects multiple apps (connect + trigger session refresh per app)
  - `getTools()` → returns tools from the MCP session
- `src/composio/oauth.ts` — OAuth flow extracted from existing CLI code:
  - Browser redirect via `open` package
  - `waitForConnection()` polling
  - Session recreation after successful connection
- `src/composio/index.ts` — `createComposio(config): ComposioClient`
  - Accepts `{ apiKey?, serverUrl? }`
  - Returns `{ connect, connectApp, getTools, listApps, disconnect, isConnected }`

Testing:
- Unit tests with mocked `@composio/core` and mocked server endpoints
- Test session lifecycle, app connection flow, error handling

### Phase 5 — MCP Direct Connections

**Goal**: `createMcpManager()` for direct MCP server connections (GitHub, Linear, Slack, custom).

Files to create:
- `src/mcp/types.ts` — `McpServerConfig`, `McpConnection`, `McpManagerConfig`
- `src/mcp/manager.ts` — `McpManager` class:
  - `connectServer(id)` → connects to a single MCP server via `@ai-sdk/mcp`
  - `connectAll()` → connects to all configured servers
  - `disconnectServer(id)` → disconnects from a single server
  - `disconnectAll()` → disconnects from all servers
  - `listTools(serverId?)` → returns tools from a specific server or all servers
  - `getTools()` → returns all tools merged as `Record<string, Tool>`
  - Auto-reconnect on connection loss (configurable)
- `src/mcp/github.ts` — GitHub MCP server connection:
  - Uses `https://api.githubcopilot.com/mcp` endpoint
  - Auth via `GITHUB_TOKEN` PAT
  - Returns GitHub-specific tools (repos, issues, PRs, code search)
- `src/mcp/linear.ts` — Linear MCP server connection:
  - Uses `https://mcp.linear.app/sse` endpoint
  - Auth via `LINEAR_API_KEY`
  - Returns Linear-specific tools (issues, projects, teams)
- `src/mcp/slack.ts` — Slack MCP server connection:
  - Uses user-provided server URL
  - Auth via `SLACK_BOT_TOKEN`
  - Returns Slack-specific tools (channels, messages, files)
- `src/mcp/custom.ts` — Custom MCP server connection:
  - Uses user-provided URL and auth
  - Returns generic MCP tools
- `src/mcp/index.ts` — `createMcpManager(config): McpManager`
  - Accepts `{ servers: McpServerConfig[] }`
  - Returns `{ connectAll, disconnectAll, listTools, getTools, isConnected }`

Testing:
- Unit tests with mock MCP servers
- Test connection lifecycle, tool discovery, error handling

### Phase 6 — Voice Integration

**Goal**: `createVoice()` with STT and TTS via Smallest.ai, ElevenLabs, and Groq (parked).

Files to create:
- `src/voice/types.ts` — `VoiceConfig`, `SttProvider`, `TtsProvider`, `SttResult`, `TtsResult`
- `src/voice/stt.ts` — Speech-to-text dispatcher:
  - Routes to the configured STT provider
  - Returns `{ text: string, language?: string }`
- `src/voice/tts.ts` — Text-to-speech dispatcher:
  - Routes to the configured TTS provider
  - Returns `{ audio: Buffer, format: "pcm" | "mp3" }`
- `src/voice/smallest.ts` — Smallest.ai provider:
  - **STT**: `POST https://api.smallest.ai/v1/speech-to-text/transcribe` (OpenAI-compatible)
    - Model: `pulse-pro` (default) or `pulse`
    - Auth: `Authorization: Bearer <key>`
  - **TTS**: `POST https://api.smallest.ai/v1/lightning/speech-synthesis` (streaming, PCM 24kHz)
    - Model: `lightning_v3.1_pro`
    - Auth: `Authorization: Bearer <key>`
- `src/voice/elevenlabs.ts` — ElevenLabs provider:
  - **STT**: `POST https://api.elevenlabs.ai/v1/speech-to-text` (requires `model_id: "scribe_v1"`)
    - Auth: `xi-api-key: <key>`
  - **TTS**: `POST https://api.elevenlabs.ai/v1/text-to-speech/{voice_id}/stream` (streaming MP3)
    - Model: `eleven_turbo_v2_5`
    - Auth: `xi-api-key: <key>`
- `src/voice/groq.ts` — Groq provider (parked):
  - **STT**: `POST https://api.groq.com/openai/v1/audio/transcriptions` (OpenAI-compatible)
    - Model: `whisper-large-v3-turbo`
    - Auth: `Authorization: Bearer <key>`
- `src/voice/index.ts` — `createVoice(config): VoiceClient`
  - Accepts `{ stt: "smallest" | "elevenlabs" | "groq", tts: "smallest" | "elevenlabs" }`
  - Returns `{ transcribe(audio), synthesize(text, voice?) }`

Testing:
- Unit tests with mocked API responses
- Test STT/TTS lifecycle, error handling, provider switching

### Phase 6b — Web Search Implementation

**Goal**: `createWebSearch()` working with Exa, Firecrawl, and Context.dev.

Files to create:
- `src/web-search/types.ts` — `WebSearchConfig`, `WebSearchProvider`, `SearchResult`, `WebSearchClient`
- `src/web-search/exa.ts` — `createExaSearch(options): WebSearchClient`
  - Uses Exa MCP endpoint `https://mcp.exa.ai/mcp` via `@ai-sdk/mcp`
  - Tools: `web_search_exa`, `web_fetch_exa`
  - Auth: API key via `x-api-key` header
- `src/web-search/firecrawl.ts` — `createFirecrawlSearch(options): WebSearchClient`
  - Uses Firecrawl MCP endpoint `https://mcp.firecrawl.dev/v2/mcp` via `@ai-sdk/mcp`
  - Tools: `firecrawl_search`, `firecrawl_scrape`, `firecrawl_crawl`
  - Auth: API key or OAuth
- `src/web-search/contextdev.ts` — `createContextDevSearch(options): WebSearchClient`
  - Uses `context.dev` npm package (REST API)
  - Methods: `scrape(url)`, `crawl(url)`, `search(query)`, `extract(url, schema)`, `getBrand(domain)`, `listMonitors()`, `createMonitor(config)`
  - Auth: Bearer token via `CONTEXTDEV_API_KEY`
- `src/web-search/index.ts` — `createWebSearch(config): WebSearchClient`
  - Routes to Exa, Firecrawl, or Context.dev based on `config.provider`
  - Returns `{ search(query), scrape(url), getTools(), listProviders() }`

Testing:
- Unit tests with mocked MCP servers and REST APIs
- Test provider switching, tool discovery, error handling

### Phase 7 — SupercodeAgent

**Goal**: High-level orchestration class combining all capabilities.

File to create:
- `src/index.ts` — `SupercodeAgent` class:
```typescript
class SupercodeAgent {
  constructor(config: {
    gateway: GatewayOptions & { model?: string }
    composio?: ComposioOptions & { apps?: string[] }
    agentHandler?: AgentHandlerOptions & { toolPacks?: string[] }
    webSearch?: WebSearchOptions & { provider?: "exa" | "firecrawl" | "contextdev" }
    mcp?: McpOptions & { servers?: McpServerConfig[] }
    voice?: VoiceOptions & { stt?: SttProvider, tts?: TtsProvider }
  })

    async init(): Promise<void>
    // 1. Creates gateway client, selects model (uses config.model or default)
    // 2. Connects agent handler if configured, selects specified tool packs
    // 3. Connects composio if configured, connects specified apps
    // 4. Connects MCP servers if configured
    // 5. Initializes voice providers if configured

    get model(): LanguageModel
    get tools(): Record<string, Tool>          // merged from all sources
    get voice(): VoiceClient                    // STT + TTS capabilities
    get isReady(): boolean

    async disconnect(): Promise<void>
    // Tears down all connections

    // Post-init discovery & selection also available:
    // agent.handler.listToolPacks()
    // agent.handler.selectPacks([...])
    // agent.composio.listApps()
    // agent.composio.selectApps([...])
    // agent.mcp.listTools(serverId?)
    // agent.mcp.connectServer(id)
  }
  ```

This is intentionally thin — just orchestration. The consumer uses `agent.model`, `agent.tools`, and `agent.voice` with their own `streamText`/`generateText` calls. Post-init discovery is accessible through the sub-clients exposed on the agent instance.

### Phase 8 — Dogfooding

**Goal**: Replace direct provider/tool code in the CLI with `cortex-sdk`.

Changes in `apps/supercode-cli/server/src/`:
- Import `createGateway` from `cortex-sdk/gateway` instead of manually instantiating `createOpenAICompatible` in:
  - `cli/ai/concentrate-service.ts`
  - `cli/ai/mergedev-service.ts`
  - `cli/ai/server-proxy-service.ts`
- Import `createAgentHandler` from `cortex-sdk/agent-handler` instead of `MergeConnectorManager` in:
  - `connectors/mergedev.ts` (can be replaced entirely)
  - `cli/commands/ai/init.ts`
- Import `createComposio` from `cortex-sdk/composio` instead of `ComposioSessionManager` in:
  - `mcp/composio.ts` (can be replaced entirely)
  - `cli/commands/slashCommands/mcp.ts`
- Import `createWebSearch` from `cortex-sdk/web-search` instead of direct Exa/Firecrawl/Context.dev API calls in:
  - `cli/ai/web-search.ts` (if exists)
  - Any direct Exa/Firecrawl/Context.dev integration code
- Import `createMcpManager` from `cortex-sdk/mcp` instead of direct MCP client usage in:
  - `mcp/index.ts`
  - `cli/commands/slashCommands/mcp.ts`
- Import `createVoice` from `cortex-sdk/voice` instead of direct API calls in:
  - `voice/speech.ts`
  - `cli/commands/voice.ts`
- Remove duplicated retry/fallback/error logic that now lives in the SDK

### Phase 9 — Documentation and Publishing

- README with:
  - Quickstart: Gateway only (30 seconds)
  - Quickstart: Gateway + Tools (2 minutes)
  - Quickstart: Full agent with voice (5 minutes)
  - API reference for all modules
  - Migration guide from direct provider usage
  - Environment variable reference (all 30+ env vars)
- JSDoc on all exported functions and types
- Initial `0.1.0` release to npm

---

## Out of Scope (v1)

| Feature | Planned For | Rationale |
|---|---|---|
| Permissions/ruleset engine | v2 | Genuine differentiator but adds significant scope. Ship core connectivity first. |
| Python SDK | v2 | After TS SDK is stable and dogfooded |
| Rust SDK | v3 | After Python SDK |
| Merging `@super/claude-sdk` and `@super/embeddings-sdk` | v2 | Tiny packages, low urgency. Can deprecate later. |
| Groq TTS provider | v2 | Parked — STT only in v1, TTS if demand exists |
| OpenRouter auto-select intelligence | v2 | Basic fallback in v1, smarter routing in v2 |
| Voice conversation mode | v2 | Bidirectional streaming STT+TTS for real-time conversation |
| MCP server marketplace | v2 | Curated list of recommended MCP servers with one-click setup |

---

## Monorepo Integration

### Location

```
packages/cortex-sdk/          # ← new
packages/sdk/                    # ← existing empty @super/sdk, leave as-is
```

The root workspace config (`workspaces: ["packages/*"]`) auto-discovers the new package.

### Turbo Integration

Add to `turbo.json`:

```jsonc
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

### Root tsconfig

Add path alias for internal consumption:

```jsonc
{
  "compilerOptions": {
    "paths": {
      "cortex-sdk": ["./packages/cortex-sdk/src"],
      "cortex-sdk/*": ["./packages/cortex-sdk/src/*"]
    }
  }
}
```

### Import Paths

```typescript
// Root import — SupercodeAgent
import { SupercodeAgent } from "cortex-sdk"

// Gateway — model access
import { createGateway } from "cortex-sdk/gateway"

// Agent Handler — MergeDev tool packs
import { createAgentHandler } from "cortex-sdk/agent-handler"

// Composio — 150+ app integrations
import { createComposio } from "cortex-sdk/composio"

// Web Search — Exa, Firecrawl, Context.dev
import { createWebSearch } from "cortex-sdk/web-search"

// MCP — direct server connections
import { createMcpManager } from "cortex-sdk/mcp"

// Voice — STT + TTS
import { createVoice } from "cortex-sdk/voice"
```

---

## Developer Experience Examples

### Simple Chatbot with Any Model

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { generateText } from "ai"

const gateway = createGateway({
  provider: "concentrateai",
  apiKey: process.env.CONCENTRATEAI_API_KEY,
})

const model = gateway.model("deepseek/deepseek-v4-flash")

const { text } = await generateText({
  model,
  messages: [{ role: "user", content: "What is the capital of France?" }],
})

console.log(text)
```

### Agent That Can Browse the Web

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createAgentHandler } from "cortex-sdk/agent-handler"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

const handler = createAgentHandler({
  apiKey: process.env.MERGE_AH_API_KEY,
  registeredUserId: process.env.MERGE_REGISTERED_USER_ID,
})

const packs = await handler.listToolPacks()
await handler.selectPacks(["web-search", "exa-search"])

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Find the latest pricing for Vercel's Pro plan and summarize it" }],
  tools: await handler.getTools(),  // includes Firecrawl, Exa
})

for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}
```

### Agent with Dedicated Web Search (Exa / Firecrawl / Context.dev)

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createWebSearch } from "cortex-sdk/web-search"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

// Exa — semantic search
const exa = createWebSearch({ provider: "exa", apiKey: process.env.EXA_API_KEY })

// Firecrawl — search + scrape
const firecrawl = createWebSearch({ provider: "firecrawl", apiKey: process.env.FIRECRAWL_API_KEY })

// Context.dev — scrape + brand intelligence + monitoring
const ctx = createWebSearch({ provider: "contextdev", apiKey: process.env.CONTEXTDEV_API_KEY })

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "Compare Vercel vs Netlify pricing" }],
  tools: await exa.getTools(),  // { web_search_exa, web_fetch_exa }
})
```

### Agent That Controls GitHub and Linear

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createComposio } from "cortex-sdk/composio"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "concentrateai",
  apiKey: process.env.CONCENTRATEAI_API_KEY,
})

const composio = createComposio({
  apiKey: process.env.COMPOSIO_API_KEY,
})

const apps = await composio.listApps()
await composio.selectApps(["github", "linear"])

const result = streamText({
  model: gateway.model("anthropic/claude-opus-4-8"),
  messages: [{
    role: "user",
    content: "Create a GitHub issue titled 'Update dependencies' in my repo, then create a Linear ticket to track it",
  }],
  tools: await composio.getTools(),
})
```

### Agent with Direct MCP Connections

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { createMcpManager } from "cortex-sdk/mcp"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "mergedev",
  apiKey: process.env.MERGE_DEV_API_KEY,
})

const mcp = createMcpManager({
  servers: [
    { id: "github", type: "github", token: process.env.GITHUB_TOKEN },
    { id: "linear", type: "linear", token: process.env.LINEAR_API_KEY },
    { id: "slack", type: "slack", token: process.env.SLACK_BOT_TOKEN },
  ],
})

await mcp.connectAll()

const result = streamText({
  model: gateway.model("anthropic/claude-sonnet-4-6"),
  messages: [{ role: "user", content: "What issues are assigned to me in Linear?" }],
  tools: mcp.getTools(),
})
```

### Voice-Enabled Agent

```typescript
import { SupercodeAgent } from "cortex-sdk"

const agent = new SupercodeAgent({
  gateway: {
    provider: "mergedev",
    apiKey: process.env.MERGE_DEV_API_KEY,
    model: "anthropic/claude-sonnet-4-6",
  },
  voice: {
    stt: "smallest",
    tts: "smallest",
  },
})

await agent.init()

// Transcribe audio
const audioBuffer = fs.readFileSync("recording.wav")
const transcript = await agent.voice.stt(audioBuffer)
console.log(transcript)

// Generate speech
const audio = await agent.voice.tts("Hello, how can I help you?")
fs.writeFileSync("response.wav", audio)
```

### OpenRouter with Fallback

```typescript
import { createGateway } from "cortex-sdk/gateway"
import { streamText } from "ai"

const gateway = createGateway({
  provider: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "anthropic/claude-sonnet-4",
})

const result = streamText({
  model: gateway.model,
  messages: [{ role: "user", content: "Explain quantum computing" }],
})

for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}
```

---

## Glossary

| Term | Definition |
|---|---|
| **Gateway** | A unified API layer that provides access to multiple AI models through a single endpoint and API key. Supports 8 providers: ConcentrateAI, MergeDev, OpenRouter, Gemini, MiniMax, NVIDIA NIM, OrcaRouter, Supercode Cloud. |
| **Agent Handler (AH)** | MergeDev's MCP-based system for providing tool packs (Firecrawl, Exa, etc.) to AI agents via the MCP protocol. |
| **Web Search** | A dedicated module for web search via Exa (semantic search), Firecrawl (search + scrape), and Context.dev (scrape + brand + monitor). Returns tools for use with Vercel AI SDK. |
| **Exa** | A neural web search engine that performs semantic searches optimized for LLMs. Supports category filtering (company, publication, news, people). |
| **Firecrawl** | A web scraping and search API that converts websites into clean, LLM-ready markdown or structured JSON. Supports search, scrape, crawl, extract, and monitor operations. |
| **Context.dev** | A unified web context API providing scraping, crawling, brand intelligence, and monitoring via REST. Returns clean markdown/HTML with automatic bot detection and proxy escalation. |
| **MCP** | Model Context Protocol — an open protocol that standardizes how applications provide context and tools to LLMs. Used for tool packs, Composio, and direct server connections. |
| **Composio** | A platform providing 150+ pre-built app integrations (GitHub, Slack, Linear, etc.) accessible via MCP. |
| **Direct MCP** | Connecting directly to MCP servers (GitHub, Linear, Slack, custom) without going through Composio or Agent Handler. |
| **Voice** | Speech-to-text (STT) and text-to-speech (TTS) capabilities. Supports Smallest.ai (recommended), ElevenLabs, and Groq (parked). |
| **STT** | Speech-to-text — converts audio input to text transcript. |
| **TTS** | Text-to-speech — converts text to audio output. |
| **BYOK** | Bring Your Own Key — a pattern where users can provide their own API key for a service, overriding the default server key. |
| **LanguageModel** | A Vercel AI SDK type representing an AI model that can be used with `streamText`, `generateText`, etc. |
| **Tool** | A Vercel AI SDK type representing a function/tool that an AI model can call. |
| **Tool Pack** | A collection of related MCP tools bundled together (e.g., a "web search" pack containing `firecrawl_search`, `firecrawl_scrape`). |
| **OAuth Flow** | The process of authorizing an app connection via browser-based OAuth, followed by polling until the connection is active. |
| **OpenRouter Fallback** | Automatic model fallback when the primary model is unavailable, supported by OpenRouter's routing infrastructure. |
| **Supercode Cloud** | Server-proxied gateway that inherits from ConcentrateAI, requiring no client-side API key management. |
