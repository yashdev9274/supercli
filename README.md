<div align="center">

  # Nova

  **Your AI engineering workspace**

  Nova brings coding agents, repositories, pull requests, connected apps, and cloud workspaces into one place. This repository contains the Nova dashboard, documentation, terminal client, coding-agent CLI, and shared packages.

  [![Website](https://img.shields.io/badge/Website-supercli.com-blue)](https://supercli.vercel.app)
  [![Built with Bun](https://img.shields.io/badge/Runtime-Bun-black)](https://bun.sh)
  [![Turborepo](https://img.shields.io/badge/Built%20with-Turborepo-EF4444)](https://turbo.build)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
  [![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
  [![CI](https://github.com/yashdev9274/supercli/actions/workflows/ci.yml/badge.svg)](https://github.com/yashdev9274/supercli/actions/workflows/ci.yml)
  [![npm](https://img.shields.io/npm/v/supercode?label=supercode)](https://www.npmjs.com/package/supercode)
  [![GitHub stars](https://img.shields.io/github/stars/yashdev9274/supercli?style=social)](https://github.com/yashdev9274/supercli)

  <img src="./apps/web/public/og-image.png" alt="Supercode Platform" width="800"/>

</div>

---

## Sponsored by Vercel

<img src="https://github.com/user-attachments/assets/5bc3b368-d71a-48aa-b45f-67cbf49fe538" />

---


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

## Quick Start

```bash
# Prerequisites: Git, Bun 1.2+, Docker Desktop (for local DB)
git clone https://github.com/yashdev9274/supercli.git
cd supercli
bun install                        # install dependencies
cp apps/web/.env.example apps/web/.env.local  # configure env
docker compose up -d               # start PostgreSQL
bun run db:migrate                 # create database tables
bun run dev:web                    # start the dashboard
```

> **Dashboard / Nova Web** → http://localhost:3003 / http://nova.localhost:3003

No database? Set one up later — `bun install` skips Prisma client generation gracefully when `DATABASE_URL` isn't set.

---

## Overview

Nova is a full-stack AI engineering workspace built as a Bun + Turborepo monorepo. It gives developers a single surface for asking agents to change code, reviewing the result, and connecting the services those agents need to get work done.

- **Nova Web** (`apps/web`) — The main workspace for projects, threads, pull requests, reviews, and connected apps
- **Documentation** (`apps/docs`) — MDX-based documentation site
- **Terminal Web Client** (`apps/supercode-cli/client`) — Browser UI for the terminal workflow
- **Coding Agent CLI** (`apps/supercode-cli/server`) — Installable `supercode` CLI with file, shell, search, and repository tools
- **API Server** (`apps/api`) — Shared backend scaffolding

## Why Nova?

Most coding-agent tools stop at a chat box or a terminal. Nova is designed as the control surface around the whole engineering loop:

- Start a thread with the right project and working context.
- Ask Nova to inspect a repository, implement a change, or explain a codebase.
- Review pull requests and diffs across connected repositories.
- Connect the tools your team already uses, then let Nova work across them with explicit approvals.
- Keep the workflow local-first where it matters, while still supporting hosted runtimes and remote collaboration.

The goal is simple: fewer tabs, less context switching, and a clear path from idea to reviewed change.

## Features

### 🧠 A workspace built around Nova threads

Create focused threads for projects, repositories, and engineering tasks. Nova keeps the conversation, selected model, tools, and working context together so every request starts from the right place.

![Nova workspace and threads](./docs/screenshots/nova-home.png)

### 🔀 Review pull requests across repositories

Search and review pull requests from connected repositories in one place. Nova surfaces review status, summaries, diffs, and actionable findings without making you jump between repository tabs.

![Nova pull request review](./docs/screenshots/nova-pull-requests.png)

### 🛠️ Make changes, then inspect the diff

Nova can work against a project, propose changes, and present the result for review. The desktop workflow keeps the repository tree, change summary, checks, and review context close together.

![Nova desktop review workflow](./docs/screenshots/nova-desktop-review.png)

### 🔌 Connect the tools your team already uses

Connect GitHub, Linear, and other services from one workspace. Once connected, Nova can use the approved apps as part of engineering workflows while keeping connection state visible.

![Nova connections](./docs/screenshots/nova-connections.png)

### 🤖 Bring your own models and agents

Nova is designed to work with the providers and agent runtimes you already use. Choose the model that fits the task, run the coding-agent CLI locally, or use the hosted Nova workflow when you want a managed environment.

### ✅ Review before anything consequential happens

Tool calls, repository changes, and external actions should be inspectable before they land. Nova keeps the human in the loop with review surfaces, approval flows, and pull-request-based collaboration.

## Powered by

Nova is built with the open tools and services that make the workspace useful:

- **Bun, Turborepo, TypeScript, and Next.js** for the monorepo and application runtime
- **React, Tailwind CSS, Radix UI, and Framer Motion** for the product interface
- **AI SDK, Anthropic, OpenRouter, and Google** for model and provider integrations
- **GitHub, Linear, and Composio** for repositories, issues, and connected tools
- **PostgreSQL, Prisma, and Inngest** for data and background jobs
- **Vercel** for hosting and deployment

## Architecture

This is a **monorepo** managed with [Turborepo](https://turbo.build) and [Bun](https://bun.sh) workspaces. Workspaces are defined in `package.json` as `apps/*`, `apps/supercode-cli/*`, and `packages/*`.

### Applications

| App | Description | Port |
|-----|-------------|------|
| `apps/web` | Next.js 16 dashboard and Nova Web | `3003` |
| `apps/docs` | Next.js MDX documentation site | `3001` |
| `apps/supercode-cli/client` | Terminal web client UI and Nova login | `3000` |
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

### AI & Agents
- **AI SDK v6** — Unified AI provider interface
- **OpenRouter** — Multi-model routing
- **Anthropic Claude** — Agent provider integration
- **Google Gemini** — Embeddings and supporting AI workflows
- **Nova runtime** — Threads, tool calls, approvals, and workspace context

### CLI
- **Commander** — CLI argument parsing
- **Clack** + **Boxen** + **Chalk** — Terminal UI primitives
- **Marked** + **marked-terminal** — Markdown rendering in terminal

## Getting Started

### Prerequisites

- **Bun** 1.2+ ([Install](https://bun.sh)) — pinned to 1.2.21
- **Git**
- **Docker Desktop** (recommended for local PostgreSQL) — [Download](https://www.docker.com/products/docker-desktop/)
- **PostgreSQL** (alternatively, use [Neon](https://neon.tech) or [Supabase](https://supabase.com))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yashdev9274/supercli.git
   cd supercli
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```
   Prisma client generation runs automatically if `DATABASE_URL` is configured, or skips gracefully if not.

3. **Set up environment variables**
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Edit `apps/web/.env.local` with your configuration. At minimum, the dashboard requires:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
   BETTER_AUTH_SECRET="your-secret-key"          # openssl rand -hex 32
   BETTER_AUTH_URL="http://localhost:3003"
   GITHUB_CLIENT_ID="your-github-oauth-id"
   GITHUB_CLIENT_SECRET="your-github-oauth-secret"
   ```

4. **Start PostgreSQL** (skip if using a remote provider)
   ```bash
   docker compose up -d
   ```

5. **Run database migrations**
   ```bash
   bun run db:migrate     # dashboard database
   ```

6. **Start the dashboard**
   ```bash
   bun run dev:web
   ```
   Open [http://localhost:3003](http://localhost:3003), or Nova at [http://nova.localhost:3003](http://nova.localhost:3003).

7. **Start other apps** (in separate terminals)
   ```bash
   bun run dev:docs             # Documentation site
   bun run dev:terminal         # Terminal web client
   bun run dev:terminal-server  # CLI agent dev loop
   ```

### CLI Quick Start

The `supercode` CLI doesn't require a database for most operations:

```bash
# Run the CLI in dev mode
bun run supercode

# Or build and run the production build
bun run build && bun run supercode:prod
```

See `apps/supercode-cli/` for the CLI's own setup and environment variables.

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
| `bun run dev:web` | Dashboard and Nova Web (port 3003) |
| `bun run dev:docs` | Docs only (port 3001) |
| `bun run dev:terminal` | Terminal web client only |
| `bun run dev:terminal-server` | CLI agent dev loop |
| `bun run dev:api` | API server only |
| `bun run dev:video` | Remotion studio |
| `bun run supercode` | Run the published CLI in dev mode |
| `bun run supercode:prod` | Run the built CLI from `dist/` |

### Build

| Script | What it does |
|--------|--------------|
| `bun run build` | Build all apps and packages |

### Database

| Script | What it does |
|--------|--------------|
| `bun run db:generate` | Generate Prisma client (dashboard) |
| `bun run db:migrate` | Deploy migrations (dashboard) |
| `bun run db:terminal:generate` | Generate Prisma client (terminal) |
| `bun run db:terminal:migrate` | Deploy migrations (terminal) |

Create new migrations from the package directory:

```bash
cd packages/db
bunx prisma migrate dev --name migration_name
cd -
```

The terminal CLI has its **own** database and Prisma schema under `packages/db-terminal/`:

```bash
cd packages/db-terminal
bunx prisma migrate dev --name migration_name
cd -
```

### Quality

| Script | What it does |
|--------|--------------|
| `bun run test` | Run all tests across the monorepo |
| `bun run lint` | Run ESLint across all packages |
| `bun run typecheck` | Run TypeScript checks |

## Environment Variables

The canonical template lives at `apps/web/.env.example` — copy it to `apps/web/.env.local` and fill in.

Variables are annotated with dependency tiers:

- **🔴 Required** — app won't start without it
- **🟡 Required for feature** — needed for auth, AI, etc.
- **⚪ Optional** — skip if you don't need the feature

## Contributing

We welcome contributions! Please see the [Contributing Guide](./CONTRIBUTING.md), [Code of Conduct](./.github/CODE_OF_CONDUCT.md), and [Security Policy](./.github/SECURITY.md) for details.

## License

This project is licensed under the **MIT License** — see [`LICENSE`](./LICENSE) for details.

---

<div align="center">
  <strong>Built for the future of software engineering by the Nova team.</strong>
</div>
