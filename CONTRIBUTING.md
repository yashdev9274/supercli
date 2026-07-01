# Contributing to Supercode

Thank you for your interest in contributing to Supercode! This document provides guidelines and instructions for contributing to this monorepo.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Database Changes](#database-changes)

## Code of Conduct

Be respectful and inclusive. Treat all contributors with courtesy and professionalism.

## Getting Started

### Prerequisites

- **Bun** 1.2+ ([Install](https://bun.sh))
- **PostgreSQL** database (dashboard + optional terminal database)
- **Git**

### Package Manager

This project uses [Bun](https://bun.sh) as the package manager. Install it first:

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/supercli.git
   cd supercli
   ```

2. **Install dependencies** (also runs Prisma client generation via `postinstall`)
   ```bash
   bun install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Configure the following required variables in `.env`:
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

   If you're also working on the terminal CLI, set up its database:
   ```bash
   cd packages/db-terminal
   bun run db:generate
   bunx prisma migrate dev
   cd ../..
   ```

5. **Start the development servers**
   ```bash
   # Start all apps
   bun run dev

   # Or start a specific app
   bun run dev:web              # Dashboard (port 3000)
   bun run dev:docs             # Documentation (port 3001)
   bun run dev:terminal         # Terminal web client
   bun run dev:terminal-server  # CLI agent dev loop
   bun run dev:api              # API server
   bun run dev:video            # Remotion studio
   ```

6. **Open your browser**
   - Dashboard: [http://localhost:3000](http://localhost:3000)
   - Docs: [http://localhost:3001](http://localhost:3001)

## Project Structure

```
supercli/
├── apps/
│   ├── web/                          # Dashboard → supercli.com
│   │   ├── app/                      # App router pages
│   │   ├── components/               # React components
│   │   ├── hooks/                    # Custom React hooks
│   │   ├── lib/                      # Utility libraries
│   │   ├── modules/                  # Feature modules
│   │   ├── inngest/                  # Background jobs (Inngest)
│   │   └── public/                   # Static assets
│   │
│   ├── docs/                         # MDX documentation site
│   │   ├── app/                      # App router pages
│   │   ├── components/
│   │   ├── content/                  # MDX docs
│   │   └── lib/
│   │
│   ├── supercode-cli/
│   │   ├── client/                   # Terminal web UI → terminal.supercli.com
│   │   └── server/                   # AI CLI agent (published as `supercode` on npm)
│   │
│   ├── api/                          # Shared API server (scaffolded)
│   └── video/                        # Remotion video generation
│
├── packages/
│   ├── db/                           # Prisma schema + client (dashboard)
│   ├── db-terminal/                  # Prisma schema + client (terminal CLI)
│   ├── auth/                         # Better-Auth config (server.ts, client.ts)
│   ├── claude-sdk/                   # Claude / Anthropic provider wrapper
│   ├── embeddings-sdk/               # Embeddings provider wrapper
│   ├── skills/                       # Shared AI agent skills
│   ├── ui/                           # Shared UI components
│   ├── sdk/                          # Internal SDK
│   ├── config/                       # Shared ESLint/TS config
│   └── dashboard/                    # Dashboard-specific components
│
├── supercode-openmodel/              # LLM fine-tuning project
├── scripts/                          # Repo-level scripts
├── turbo.json                        # Turborepo config
└── package.json                      # Root package
```

## Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers |
| `bun run build` | Build all packages and apps |
| `bun run lint` | Run ESLint across all packages |
| `bun run typecheck` | Run TypeScript checks |
| `bun run dev:web` | Start only the dashboard |
| `bun run dev:docs` | Start only the docs site |
| `bun run dev:terminal` | Start the terminal web client |
| `bun run dev:terminal-server` | Run the CLI agent in dev mode |
| `bun run dev:api` | Start the API server |
| `bun run dev:video` | Start the Remotion studio |
| `bun run supercode` | Run the CLI agent in dev mode (alias for server dev loop) |

### Database Commands

**Dashboard database** (`packages/db/`):

```bash
cd packages/db
bun run db:generate                 # Clean + regenerate Prisma client
bun run db:migrate                  # Deploy migrations
bunx prisma migrate dev --name name # Create a new migration
bunx prisma studio                  # Open Prisma Studio
```

**Terminal CLI database** (`packages/db-terminal/`):

```bash
cd packages/db-terminal
bun run db:generate
bunx prisma migrate dev --name name
```

## Code Style Guidelines

### Formatting

- **No semicolons** at end of statements
- **Double quotes** for strings
- **2-space indentation**
- **Trailing commas** in multi-line objects/arrays

### Imports

Order imports by category, separated by blank lines:

```typescript
// 1. React/Next
import { useState } from "react"
import { useRouter } from "next/navigation"

// 2. External libraries
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

// 3. Internal aliases (workspace packages)
import { Button } from "@/components/ui/button"
import { auth } from "@super/auth"

// 4. Relative imports
import { LocalComponent } from "./local-component"
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `Button.tsx`, `HeroSection.tsx` |
| Non-component files | kebab-case | `utils.ts`, `query-provider.tsx` |
| Functions | camelCase | `getUserSession`, `validateInput` |
| Types/Interfaces | PascalCase | `UserSession`, `ApiResponse` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL` |

### TypeScript

- Strict mode is enabled
- Use `type` for type aliases when possible
- Prefer explicit return types on library functions
- Use `interface` for object shapes that may be extended

### React Patterns

- **Server Components by default** (Next.js App Router)
- Use `'use client'` directive only when needed (hooks, browser APIs)
- Destructure props in function parameters

```typescript
// Preferred
function Button({ children, variant }: ButtonProps) {
  return <button className={variant}>{children}</button>
}

// Avoid
function Button(props: ButtonProps) {
  return <button className={props.variant}>{props.children}</button>
}
```

### Styling (Tailwind CSS v4)

- Use `cn()` utility from `@/lib/utils` (web) or `lib/utils` (client) for conditional classes
- Prefer semantic CSS variables over hardcoded values
- Follow CVA (class-variance-authority) pattern for component variants

```typescript
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva("inline-flex items-center", {
  variants: {
    variant: {
      default: "bg-primary text-white",
      outline: "border border-input",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  className?: string
}
```

### Database (Prisma)

- Dashboard schema: `packages/db/prisma/schema.prisma`
- Terminal schema: `packages/db-terminal/prisma/schema.prisma`
- Always regenerate after schema changes: `bun run db:generate`
- Use `@map()` for custom table names in snake_case
- Add indexes for frequently queried foreign keys

### CLI Pattern (supercode-cli/server)

The server app follows a structured CLI pattern:

```
apps/supercode-cli/server/src/
├── index.ts          # Entry point (dev mode)
├── cli/
│   ├── main.ts       # CLI bootstrap
│   ├── commands/     # `supercode <command>` implementations
│   ├── chat/         # Interactive chat loop
│   ├── ai/           # AI provider orchestration
│   ├── tools/        # Tool definitions (read_file, execute_command, etc.)
│   ├── workspace/    # Workspace management
│   └── utils/        # CLI utilities
├── service/          # AI provider integration layer
├── tools/            # Tool execution engine
├── lib/              # Shared libraries
├── config/           # Configuration
└── types/            # TypeScript types
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style changes (formatting, etc.) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```
feat(auth): add GitHub OAuth support
fix(db): resolve connection pooling issue
docs(readme): update installation instructions
refactor(ui): extract button component to shared package
feat(cli): add workspace list command
```

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes and commit**
   ```bash
   git add .
   git commit -m "feat(scope): your changes"
   ```

3. **Run checks before pushing**
   ```bash
   bun run lint
   bun run typecheck
   ```

4. **Push and create PR**
   ```bash
   git push origin feat/your-feature-name
   ```

5. **PR Requirements**
   - Clear description of changes
   - Reference any related issues with "Fixes #issue"
   - Pass all CI checks (typecheck, lint, test)
   - Add tests for new functionality where applicable
   - Request review from maintainers

### Branch Naming Convention

- Feature: `feat/feature-name`
- Bug fix: `fix/bug-name`
- Documentation: `docs/doc-name`
- Refactor: `refactor/component-name`
- Issue-linked: `supercli-#<issue-number>` (for Linear-tracked issues)

## Testing

This project uses **`bun test`** (Bun's built-in test runner). Test files use the `*.test.ts` convention.

### Running Tests

```bash
# Run all tests across the monorepo
bun test

# Run tests for a specific app/package
cd apps/supercode-cli/server
bun test

# Run a single test file
bun test path/to/file.test.ts

# Watch mode
bun test --watch
```

### Writing Tests

- Use `import { test, expect, describe } from "bun:test"`
- Place test files next to the code they test with a `.test.ts` suffix
- Run `bun run typecheck` to verify types before submitting

## Database Changes

### Dashboard Schema

1. **Edit the schema**
   `packages/db/prisma/schema.prisma`

2. **Create a migration**
   ```bash
   cd packages/db
   bunx prisma migrate dev --name your_migration_name
   ```

3. **Regenerate the client**
   ```bash
   bun run db:generate
   ```

4. **Update dependent code**
   - Check for TypeScript errors
   - Update any affected queries

### Terminal CLI Schema

The terminal CLI has its own isolated schema:

```bash
cd packages/db-terminal
# Edit prisma/schema.prisma
bunx prisma migrate dev --name your_migration_name
bun run db:generate
```

## Need Help?

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Reach out to maintainers

---

Thank you for contributing to Supercode!
