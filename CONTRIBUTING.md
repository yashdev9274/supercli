# Contributing to Supercode

Thank you for your interest in contributing! This guide will help you get the repo running locally and navigate the codebase.

## Quick Start

```bash
# 1. Prerequisites: Git, Bun 1.2+, Docker Desktop (recommended)
git clone https://github.com/yashdev9274/supercli.git
cd supercli

# 2. Install dependencies (Bun is pinned to v1.2.21 — run via bunx if needed)
bun install

# 3. Set up environment
cp apps/web/.env.example apps/web/.env.local

# 4. Start PostgreSQL (Docker) — or use any PostgreSQL provider
docker compose up -d

# 5. Run database migrations
bun run db:migrate

# 6. Start the dashboard
bun run dev:web
# → http://localhost:3000
```

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) | 1.2.21 (pinned) | Runtime & package manager |
| [Docker Desktop](https://docker.com) | Latest | Local PostgreSQL (optional) |
| Git | Any | Version control |

The project's `packageManager` field in `package.json` pins Bun to 1.2.21. Bun automatically uses the right version when installed via the official installer.

If you use an external PostgreSQL provider (Neon, Supabase, Railway), skip Docker and set your `DATABASE_URL` in `apps/web/.env.local`.

## Project Structure

```
supercli/
├── apps/
│   ├── web/                          # Dashboard → supercli.com
│   ├── docs/                         # MDX documentation site
│   ├── supercode-cli/
│   │   ├── client/                   # Terminal web UI
│   │   └── server/                   # AI CLI agent (published as `supercode`)
│   ├── api/                          # Shared API server (scaffolded)
│   └── video/                        # Remotion video generation
├── packages/
│   ├── db/                           # Prisma schema + client (dashboard)
│   ├── db-terminal/                  # Prisma schema + client (terminal CLI)
│   ├── auth/                         # Better-Auth configuration
│   ├── ui/                           # Shared UI components
│   ├── sdk/                          # Internal SDK
│   ├── claude-sdk/                   # Claude/Antrop provider wrapper
│   ├── embeddings-sdk/               # Embeddings provider wrapper
│   └── skills/                       # Shared AI agent skills
├── scripts/
│   ├── postinstall.ts                # Runs after bun install
│   └── setup.ts                      # Automated setup wizard
└── package.json                      # Root workspace config
```

## Available Scripts

Run from the **repo root** unless noted.

### Development

| Command | What it starts |
|---------|---------------|
| `bun run dev` | All dev servers (Turborepo) |
| `bun run dev:web` | Dashboard only (port 3000) |
| `bun run dev:docs` | Docs site (port 3001) |
| `bun run dev:terminal` | Terminal web client |
| `bun run dev:terminal-server` | CLI agent dev loop |
| `bun run dev:api` | API server |
| `bun run dev:video` | Remotion studio |
| `bun run supercode` | Run the CLI in dev mode |

### Quality

| Command | What it checks |
|---------|---------------|
| `bun run check` | lint + typecheck + test (mirrors CI) |
| `bun run lint` | ESLint across all packages |
| `bun run typecheck` | TypeScript type checking |
| `bun test` | Run all tests |

### Database

| Command | What it does |
|---------|-------------|
| `bun run db:generate` | Generate Prisma client (dashboard) |
| `bun run db:migrate` | Deploy migrations (dashboard) |
| `bun run db:generate:terminal` | Generate Prisma client (terminal) |
| `bun run db:studio:terminal` | Open Prisma Studio (terminal) |

Create migrations from the package directory:

```bash
cd packages/db
bunx prisma migrate dev --name your_migration_name
cd -
```

The terminal CLI has its **own** database schema under `packages/db-terminal/`.

## Environment Variables

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the values.

The template is annotated with dependency tiers:
- **🔴 Required** — app won't start without it
- **🟡 Required for feature** — needed for auth, AI, etc.
- **⚪ Optional** — skip if you don't need the feature

Example for local development:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
BETTER_AUTH_SECRET="your-secret"          # openssl rand -hex 32
BETTER_AUTH_URL="http://localhost:3000"
GITHUB_CLIENT_ID="your-github-client-id"  # from github.com/settings/developers
GITHUB_CLIENT_SECRET="your-github-secret"
```

## Development Workflow

### 1. Pick an Issue

Check [open issues](https://github.com/yashdev9274/supercli/issues) — good first issues are tagged. Comment to let others know you're working on it.

### 2. Create a Branch

```bash
git checkout -b feat/your-feature-name
```

Branch naming:
- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation
- `refactor/` — code refactoring

### 3. Make Changes

- Follow the code style (see below)
- Add tests for new functionality
- Keep changes scoped to the issue

### 4. Run Checks

```bash
bun run check
```

This runs linting, TypeScript checks, and tests — same checks as CI.

### 5. Commit

```bash
git add .
git commit -m "feat(scope): concise description"
```

Format: `<type>(<scope>): <subject>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### 6. Push and Create a PR

```bash
git push origin feat/your-feature-name
```

PR requirements:
- Clear description of changes
- Reference related issues
- Pass all CI checks
- Screenshots for UI changes

## Code Style

- **No semicolons** at end of statements
- **Double quotes** for strings
- **2-space indentation**
- **Trailing commas** in multi-line objects/arrays

### Imports (grouped by category)

```typescript
import { useState } from "react"
import { useRouter } from "next/navigation"

import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { auth } from "@super/auth"

import { LocalComponent } from "./local-component"
```

### Components

- **Server Components by default** (Next.js App Router)
- `'use client'` only when hooks or browser APIs are needed
- Destructure props in function parameters
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Follow CVA (class-variance-authority) pattern for variants

### Naming

| Type | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `Button.tsx` |
| Non-component files | kebab-case | `utils.ts` |
| Functions | camelCase | `getSession` |
| Types/Interfaces | PascalCase | `UserSession` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |

## Database Changes

Both databases share one PostgreSQL instance but have separate schemas.

### Dashboard Schema (`packages/db/`)

```bash
cd packages/db
# Edit prisma/schema.prisma
bunx prisma migrate dev --name your_migration_name
bun run db:generate
cd -
```

### Terminal Schema (`packages/db-terminal/`)

```bash
cd packages/db-terminal
# Edit prisma/schema.prisma
bunx prisma migrate dev --name your_migration_name
bun run db:generate
cd -
```

## Testing

Uses Bun's built-in test runner. Test files use `.test.ts` convention and sit next to the code they test.

```bash
# Run all tests
bun test

# Single file
bun test path/to/file.test.ts

# Watch mode
bun test --watch
```

```typescript
import { test, expect, describe } from "bun:test"

describe("my feature", () => {
  test("works correctly", () => {
    expect(1 + 1).toBe(2)
  })
})
```

## Need Help?

- Open a [GitHub issue](https://github.com/yashdev9274/supercli/issues)
- Ask in existing discussions
- Tag maintainers on your PR

---

Thank you for contributing!
