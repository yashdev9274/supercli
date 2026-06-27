<div align="center">

  # Supercode

  **AI-Powered SWE Agent**

  A monorepo containing the Supercode dashboard, documentation, terminal web client, CLI coding agent, and shared packages.

  [![Website](https://img.shields.io/badge/Website-supercli.com-blue)](https://supercli.vercel.app)
  [![Built with Bun](https://img.shields.io/badge/Runtime-Bun-black)](https://bun.sh)
  [![Turborepo](https://img.shields.io/badge/Built%20with-Turborepo-EF4444)](https://turbo.build)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
  [![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

  <img src="./apps/web/public/og-image.png" alt="Supercode Platform" width="800"/>

</div>

---

## Star History

<a href="https://www.star-history.com/?repos=yashdev9274%2Fsupercli&type=date&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yashdev9274/supercli&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yashdev9274/supercli&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yashdev9274/supercli&type=date&legend=top-left" />
 </picture>
</a>

---

## Overview

Supercode is a full-stack AI-powered development platform built as a Bun + Turborepo monorepo. It includes a web dashboard, an MDX documentation site, an AI coding agent CLI, a terminal-style web client, and a parallel project for fine-tuning open-source LLMs.

- **Dashboard** (`apps/web`) — Next.js dashboard for managing repositories, viewing analytics, and GitHub OAuth
- **Documentation** (`apps/docs`) — MDX-based documentation site
- **Terminal Web Client** (`apps/supercode-cli/client`) — Browser UI that mirrors the CLI experience
- **Supercode CLI** (`apps/supercode-cli/server`) — AI-powered coding agent published to npm as `supercode`
- **API Server** (`apps/api`) — Scaffolding for a shared backend
- **Open Model** (`supercode-openmodel/`) — Fine-tuning open-source LLMs (Qwen3, GLM-4) for coding tasks

## Architecture

This is a **monorepo** managed with [Turborepo](https://turbo.build) and [Bun](https://bun.sh) workspaces. Workspaces are defined in `package.json` as `apps/*`, `apps/supercode-cli/*`, and `packages/*`.

### Applications

| App | Description | Port |
|-----|-------------|------|
| `apps/web` | Next.js 16 dashboard (supercli.com) | `3000` |
| `apps/docs` | Next.js MDX documentation site | `3001` |
| `apps/supercode-cli/client` | Terminal web client UI (Next.js) | `3002` |
| `apps/supercode-cli/server` | AI coding agent — also published as the `supercode` npm CLI | — |
| `apps/api` | Shared API server (scaffolded) | TBD |


### Packages

| Package | Description |
|---------|-------------|
| `@super/db` | Prisma client + schema for the dashboard database |
| `@super/auth` | Better-Auth configuration (server + client) |
| `@super/ui` | Shared UI components |
| `@super/sdk` | Internal SDK |
| `@super/config` | Shared configuration (ESLint, TS, etc.) |
| `@super/dashboard` | Dashboard-specific component library |
| `@super/db-terminal` | Prisma client + schema for the terminal CLI's separate database |
| `@super/claude-sdk` | Claude / Anthropic AI SDK wrapper |
| `@super/embeddings-sdk` | Embeddings provider SDK (Gemini, etc.) |
| `@super/skills` | Reusable AI agent skills shared across apps |

## Terminal Stack 🖥️

The `apps/supercode-cli` workspace contains two sub-apps that together form the Supercode terminal product:

```
apps/supercode-cli/
├── client/   # Next.js 16 web client — terminal.supercli.com
└── server/   # Bun-powered AI coding agent, exposed as the `supercode` CLI
```

- **Client** is a Next.js app that mirrors the terminal experience in the browser, intended to be deployed to `terminal.supercli.com`.
- **Server** is a real installable CLI (`supercode` on npm) built with Bun and the AI SDK. It supports multiple model providers (OpenRouter, Anthropic, Google) and ships with a tool system (file read/write, command execution, search, etc.).

Run the CLI locally with:

```bash
bun run supercode              # dev (from root)
bun run dev:terminal           # run the web client
bun run dev:terminal-server    # run the CLI dev loop
```

## Supercode Open Model 🧠

We're building a **coding-focused LLM** by fine-tuning open-source models for the Supercode CLI. This project runs in parallel with the main platform.

### Goal

Fine-tune open models to create an AI assistant specialized in:
- Code generation and completion
- Debugging and error fixing
- Code explanation and documentation
- Multi-language programming support

### Training Strategy

We're using a **dual-track approach** to train two models simultaneously:

| Track | Infrastructure | Model | Method | Estimated Cost |
|-------|----------------|-------|--------|----------------|
| **Track 1** | [Tinker](https://thinkingmachines.ai/tinker/) (Managed) | Qwen3-8B | LoRA | $150 free credits |
| **Track 2** | [Modal](https://modal.com) + Axolotl | GLM-4-9B | LoRA/QLoRA | ~$15-20 |

### Project Structure

```
supercode-openmodel/
├── training/
│   ├── data/                    # Dataset preparation scripts
│   ├── tinker_qwen3/            # Tinker + Qwen3 training code
│   └── evaluation/              # Model evaluation scripts
├── models/                      # Model checkpoints
├── config/                      # Training configurations
└── pyrightconfig.json
```

### Training Datasets

We use high-quality coding datasets:

| Dataset | Size | Purpose |
|---------|------|---------|
| [CodeAlpaca](https://huggingface.co/datasets/HuggingFaceH4/CodeAlpaca_20K) | 20K | Instruction tuning |
| [OpenCodeReasoning](https://huggingface.co/datasets/nvidia/OpenCodeReasoning) | 100K+ | Reasoning + coding |
| [CodeFeedback](https://huggingface.co/datasets/m-a-p/CodeFeedback-Filtered-Instruction) | 156K | Instruction-response |

### Quick Start

1. **Set up Tinker (Track 1)**
   ```bash
   pip install tinker
   export TINKER_API_KEY="your-key"
   cd supercode-openmodel/training/tinker_qwen3
   python train.py
   ```

2. **Set up Modal (Track 2)**
   ```bash
   pip install modal
   modal token new
   # Configure HuggingFace token in Modal secrets
   modal run --detach src.train --config=config/glm4.yml
   ```

### Current Status

🚧 **In Progress** — Actively training and evaluating models. The best-performing model will be deployed to the Supercode CLI.

---

## Tech Stack

### Framework & Runtime
- **Next.js 16** — React framework with App Router
- **React 19** — UI library
- **TypeScript 5** — Type safety
- **Bun 1.2+** — JavaScript runtime & package manager

### Monorepo
- **Turborepo 2** — Build system for monorepos

### Database & ORM
- **PostgreSQL** — Primary database
- **Prisma 7** — Database ORM (separate schemas for `db` and `db-terminal`)
- **Pinecone** — Vector database

### Authentication
- **Better Auth** — Authentication system
- **GitHub OAuth** — Social login

### Background Jobs
- **Inngest** — Event-driven background jobs in `apps/web`

### UI & Styling
- **Tailwind CSS v4** — Utility-first CSS
- **Radix UI** + **Base UI** — Component primitives
- **Framer Motion** — Animations
- **Lucide Icons** — Icon library
- **shadcn/ui** — Component scaffolding for `supercode-cli/client`

### State & Data
- **TanStack Query** — Server state management
- **React Hook Form** — Form handling
- **Zod** — Schema validation

### AI & ML
- **AI SDK v6** — Unified AI provider interface
- **OpenRouter** — Multi-model routing
- **Anthropic Claude** — Default model
- **Google Gemini** — Embeddings
- **Vercel Minimax AI Provider** — Additional model provider

### CLI
- **Commander** — CLI argument parsing
- **Clack** + **Boxen** + **Chalk** — Terminal UI primitives
- **Marked** + **marked-terminal** — Markdown rendering in terminal

## Getting Started

### Prerequisites

- **Bun** 1.2+ ([Install](https://bun.sh))
- **PostgreSQL** database ([Neon](https://neon.tech), [Supabase](https://supabase.com), or local)
- **Git**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yashdev9274/supercli.git
   cd supercli
   ```

2. **Install dependencies** (this also runs `db:generate` via `postinstall`)
   ```bash
   bun install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration. At minimum, the dashboard requires:
   ```env
   DATABASE_URL="postgresql://..."
   BETTER_AUTH_SECRET="your-secret-key"
   BETTER_AUTH_URL="http://localhost:3000"
   GITHUB_CLIENT_ID="your-github-oauth-id"
   GITHUB_CLIENT_SECRET="your-github-oauth-secret"
   ```

4. **Set up the database**
   ```bash
   cd packages/db
   bun run db:generate
   bunx prisma migrate dev
   cd ../..
   ```

5. **Start development servers**
   ```bash
   # Start everything
   bun run dev

   # Or start specific apps
   bun run dev:web              # Dashboard on http://localhost:3000
   bun run dev:docs             # Docs on http://localhost:3001
   bun run dev:terminal         # Terminal web client
   bun run dev:terminal-server  # CLI agent dev loop
bun run dev:api              # API server
   ```

6. **Open your browser**
   - Dashboard: [http://localhost:3000](http://localhost:3000)
   - Documentation: [http://localhost:3001](http://localhost:3001)

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL: `http://localhost:3000/api/auth/callback/github` (for local development). In production, use your deployed domain, e.g., `https://your-app.com/api/auth/callback/github`.
4. Copy Client ID and Client Secret to your `.env` file

## Project Structure

```
supercli/
├── apps/
│   ├── web/                          # Dashboard → supercli.com
│   │   ├── app/                      # Next.js App Router pages
│   │   ├── components/               # React components
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── lib/                      # Utility libraries
│   │   ├── modules/                  # Feature modules
│   │   ├── inngest/                  # Background job functions
│   │   └── public/                   # Static assets (og-image, etc.)
│   │
│   ├── docs/                         # MDX documentation site
│   │   ├── app/                      # App router pages
│   │   ├── components/
│   │   ├── content/                  # MDX documentation files
│   │   └── lib/
│   │
│   ├── supercode-cli/
│   │   ├── client/                   # Next.js terminal web UI → terminal.supercli.com
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── server/                   # Bun CLI agent (published as `supercode` on npm)
│   │       ├── src/
│   │       │   ├── cli/              # CLI commands + chat loop
│   │       │   ├── service/          # AI provider service layer
│   │       │   ├── tools/            # Tool implementations
│   │       │   ├── lib/              # Shared libraries
│   │       │   ├── config/           # Config + env handling
│   │       │   └── types/
│   │       └── prisma/               # Terminal DB schema (uses @super/db-terminal)
│   │
│   ├── api/                          # Shared API server (scaffolded)
│
├── packages/
│   ├── db/                           # Prisma client for dashboard DB
│   │   └── prisma/schema.prisma
│   │
│   ├── db-terminal/                  # Prisma client for terminal DB (separate schema)
│   │   └── prisma/schema.prisma
│   │
│   ├── auth/                         # Better-Auth config
│   │   └── src/
│   │       ├── server.ts
│   │       └── client.ts
│   │
│   ├── claude-sdk/                   # Claude / Anthropic provider wrapper
│   ├── embeddings-sdk/               # Embeddings provider wrapper
│   ├── skills/                       # Shared AI agent skills
│   ├── ui/                           # Shared UI components
│   ├── sdk/                          # Internal SDK
│   ├── config/                       # Shared ESLint/TS config
│   └── dashboard/                    # Dashboard-specific components
│
├── supercode-openmodel/              # LLM fine-tuning project
│   ├── training/
│   │   ├── data/
│   │   ├── tinker_qwen3/
│   │   └── evaluation/
│   ├── models/                       # Checkpoints
│   └── config/
│
├── scripts/                          # Repo-level scripts
├── turbo.json                        # Turborepo config
├── package.json                      # Root package (workspaces, scripts)
├── bun.lock                          # Bun lockfile
├── .env.example                      # Environment template
├── CONTRIBUTING.md                   # Contribution guide
└── README.md                         # This file
```

## Available Scripts

Run from the **repo root** unless otherwise noted.

### Development

| Script | What it does |
|--------|--------------|
| `bun run dev` | Start all dev servers (Turborepo) |
| `bun run dev:web` | Dashboard only (port 3000) |
| `bun run dev:docs` | Docs only (port 3001) |
| `bun run dev:terminal` | Terminal web client only |
| `bun run dev:terminal-server` | CLI agent dev loop |
| `bun run dev:api` | API server only |
| `bun run dev:video` | Remotion studio |
| `bun run supercode` | Run the published CLI in dev mode |
| `bun run supercode:prod` | Run the built CLI from `dist/` |

### Build & Quality

| Script | What it does |
|--------|--------------|
| `bun run build` | Build all apps and packages |
| `bun run lint` | Run ESLint across all packages |
| `bun run typecheck` | Run TypeScript checks |

### Database

From `packages/db/`:

```bash
bun run db:generate      # Clean and regenerate Prisma client
bun run db:migrate       # Deploy migrations to the configured DB
bunx prisma studio       # Open Prisma Studio
bunx prisma migrate dev --name migration_name  # Create a new migration
```

The terminal CLI has its **own** database and Prisma schema under `packages/db-terminal/`:

```bash
cd packages/db-terminal
bun run db:generate
bunx prisma migrate dev --name migration_name
```

## Environment Variables

See [`.env.example`](./.env.example) for the full template. The variables below are documented for convenience.

### Required (Dashboard)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Session encryption secret (generate with `openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Base URL of the dashboard (e.g., `http://localhost:3000` for dev) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Public auth URL exposed to the client |
| `NEXT_PUBLIC_APP_BASE_URL` | Public base URL of the app (used for OAuth callbacks, absolute links) |

### Optional

| Variable | Description |
|----------|-------------|
| `GOOGLE_GEMINI_API_KEY` | Google Gemini (embeddings + text) |
| `PINECONE_DB_API_KEY` | Pinecone vector database |
| `HUGGING_FACE_TOKEN` | Hugging Face API token |
| `TINKER_API_KEY` | Tinker API key for LLM fine-tuning |
| `VERCEL_OIDC_TOKEN` | Auto-generated by Vercel CLI for deployment |

## Contributing

We welcome contributions! Please see the [Contributing Guide](./CONTRIBUTING.md) for details on:

- Development setup
- Code style guidelines
- Commit conventions
- Pull request process

## License

This project is licensed under the **MIT License** — see [`apps/supercode-cli/server/LICENSE`](./apps/supercode-cli/server/LICENSE) for the published CLI's terms. Internal application code is currently private and proprietary to the Supercode team.

---

<div align="center">
  <strong>Built with ❤️ by the Supercode team!</strong>
</div>
