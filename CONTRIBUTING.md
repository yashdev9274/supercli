# Contributing to Supercode

Thank you for your interest in contributing to Supercode! This document provides guidelines and instructions for contributing.

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

- **Node.js** 18+ or **Bun** (recommended)
- **PostgreSQL** database
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

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Set up environment variables**
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
   
   Configure the following required variables:
   ```env
   DATABASE_URL="postgresql://..."
   GITHUB_CLIENT_ID="..."
   GITHUB_CLIENT_SECRET="..."
   NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000"
   BETTER_AUTH_SECRET="..."
   ```

4. **Set up the database**
   ```bash
   cd packages/db
   bun run db:generate
   bunx prisma migrate dev
   ```

5. **Start the development server**
   ```bash
   # From root - starts all apps
   bun run dev

   # Or start specific apps
   bun run dev:web      # Dashboard (port 3000)
   bun run dev:docs     # Documentation (port 3001)
   bun run dev:terminal # Terminal client
   ```

6. **Open your browser**
   - Dashboard: [http://localhost:3000](http://localhost:3000)
   - Docs: [http://localhost:3001](http://localhost:3001)

## Project Structure

```
supercli/
├── apps/
│   ├── web/                 # Next.js dashboard app → supercli.com
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # Utility libraries
│   │   └── modules/         # Feature modules
│   │
│   ├── docs/                # Documentation site
│   │   ├── app/             # App router pages
│   │   └── content/         # MDX documentation files
│   │
│   ├── video/               # Remotion video generation
│   │
│   ├── api/                 # API server (scaffolded)
│   │
│   └── supercode-cli/       # Terminal AI app
│       ├── client/          # Terminal web client
│       └── server/          # WebSocket server
│
├── packages/
│   ├── db/                  # Prisma database client
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   ├── auth/                # Better-Auth configuration
│   │   ├── server.ts        # Server-side auth
│   │   └── client.ts        # Client-side auth
│   │
│   ├── ui/                  # Shared UI components
│   ├── sdk/                 # SDK package
│   ├── config/              # Shared configuration
│   └── dashboard/           # Dashboard components
│
├── turbo.json               # Turborepo configuration
└── package.json             # Root package.json
```

## Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers |
| `bun run build` | Build all packages and apps |
| `bun run lint` | Run ESLint across all packages |
| `bun run typecheck` | Run TypeScript checks |
| `bun run dev:web` | Start only web app |
| `bun run dev:docs` | Start only docs app |
| `bun run dev:terminal` | Start terminal client |

### Database Commands

```bash
cd packages/db

# Generate Prisma client
bun run db:generate

# Deploy migrations
bun run db:migrate

# Create a new migration
bunx prisma migrate dev --name your_migration_name

# Open Prisma Studio
bunx prisma studio
```

## Code Style Guidelines

### Formatting

- **No semicolons** at end of statements
- **Double quotes** for strings
- **2-space indentation**
- **Trailing commas** in multi-line objects/arrays

### Imports

Order your imports as follows (separated by blank lines):

```typescript
// 1. React/Next
import { useState } from "react"
import { useRouter } from "next/navigation"

// 2. External libraries
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

// 3. Internal aliases
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

- Use `cn()` utility for conditional classes
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

- Schema location: `packages/db/prisma/schema.prisma`
- Always regenerate client after schema changes: `bun run db:generate`
- Use `@map()` for custom table names in snake_case
- Add indexes for frequently queried foreign keys

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
   - Reference any related issues
   - Pass all CI checks
   - Request review from maintainers

### Branch Naming Convention

- Feature: `feat/feature-name`
- Bug fix: `fix/bug-name`
- Documentation: `docs/doc-name`
- Refactor: `refactor/component-name`

## Testing

**No test framework is currently configured.** The project is in early development.

When tests are added, follow this pattern:

```bash
# Run all tests
bun test

# Run a single test file
bun test path/to/file.test.ts

# Run tests in watch mode
bun test --watch
```

## Database Changes

1. **Modify the schema**
   Edit `packages/db/prisma/schema.prisma`

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

## Need Help?

- Open an issue for bugs or feature requests
- Join discussions in existing issues
- Reach out to maintainers

---

Thank you for contributing to Supercode!
