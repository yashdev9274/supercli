# Agent Instructions for Supercode Monorepo

## Build Commands

```bash
# Root level commands
bun run dev          # Start all dev servers
bun run build        # Build all packages and apps
bun run lint         # Run linting across all packages
bun run typecheck    # Run TypeScript checks across all packages

# Individual app/package commands
bun run dev:web      # Start only web app (Next.js)
bun run dev:api      # Start only API app
bun run dev:cli      # Start only CLI app

# Package-specific commands (run from package directory)
cd packages/db && bun run db:generate    # Generate Prisma client
cd packages/db && bun run db:migrate     # Deploy Prisma migrations
```

**Note:** This project uses Bun as the package manager (`bun@1.2.21`).

## Testing

Uses `bun test` (Bun's built-in test runner). Test files use `*.test.ts` convention.

```bash
# Run all tests
bun test

# Run a single test file
bun test path/to/file.test.ts

# Run tests in watch mode
bun test --watch
```

## Code Style Guidelines

### Imports
- Use absolute imports with path aliases: `@/components/ui/button` for web app
- Use workspace imports for cross-package dependencies: `@super/db`, `@super/auth`
- Import order: React/Next → External libs → Internal aliases → Relative imports
- Group imports by category with blank lines between groups

### Formatting
- No semicolons at end of statements
- Use double quotes for strings
- 2-space indentation
- Trailing commas in multi-line objects/arrays
- No explicit return type on function components (inferred)

### Naming Conventions
- **Components:** PascalCase (e.g., `Button.tsx`, `HeroSection.tsx`)
- **Files:** kebab-case for non-component files (e.g., `utils.ts`, `query-provider.tsx`)
- **Functions:** camelCase (e.g., `signIn`, `getSession`)
- **Types/Interfaces:** PascalCase (e.g., `VariantProps`)
- **Constants:** UPPER_SNAKE_CASE for true constants

### Types & TypeScript
- Strict mode enabled (`strict: true` in tsconfig)
- Use `type` for type aliases when possible
- Export types explicitly when needed for consumers
- Use `interface` for object shapes that may be extended
- Prefer explicit return types on library functions

### Error Handling
- Use try-catch for async operations
- Validate with Zod for form/API inputs
- Return early pattern for guard clauses
- Use `!` operator sparingly; prefer proper null checks

### React Patterns
- Server Components by default (Next.js App Router)
- 'use client' directive only when needed (hooks, browser APIs)
- Composition pattern for component variants (see `buttonVariants` pattern)
- `forwardRef` pattern for component ref forwarding
- Destructure props in function parameters

### Styling (Tailwind CSS v4)
- Use `cn()` utility from `@/lib/utils` for conditional classes
- Prefer semantic CSS variables over hardcoded values
- Use `data-slot` attributes for component identification
- Follow CVA (class-variance-authority) pattern for variants

### Database (Prisma)
- Schema location: `packages/db/prisma/schema.prisma`
- Always regenerate client after schema changes: `bun run db:generate`
- Use `@map()` for custom table names in snake_case
- Add indexes for frequently queried foreign keys

### Monorepo Structure
```
apps/
  web/           # Next.js 16 web app (main)
  api/           # API app (scaffolded)
  supercode-cli/ # CLI app (scaffolded)
packages/
  db/            # Prisma database client
  auth/          # Better-Auth authentication
  ui/            # Shared UI components (empty)
  sdk/           # SDK package (empty)
  config/        # Shared config (empty)
  dashboard/     # Dashboard components
```

### Environment Variables
- Web app: `apps/web/.env` or `apps/.env.local`
- Required for auth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `NEXT_PUBLIC_BETTER_AUTH_URL`
- Required for DB: `DATABASE_URL`

### Linting
- ESLint configured for web app only (`apps/web/eslint.config.mjs`)
- Uses `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Run: `bun run lint` (from root) or `bun run lint` (from web directory)

### Git
- Branch naming: `supercli-#<issue-number>`
- No pre-commit hooks configured yet

## Key Dependencies
- **Framework:** Next.js 16, React 19, TypeScript 5
- **Auth:** Better-Auth with Prisma adapter
- **DB:** PostgreSQL with Prisma ORM
- **UI:** Radix UI primitives + Tailwind CSS v4
- **State:** TanStack Query (React Query)
- **Forms:** React Hook Form + Zod

## Conventions to Follow
1. Always run `bun run db:generate` after modifying `schema.prisma`
2. Use `workspace:*` for internal package dependencies
3. Keep components in `components/` folder, organized by feature
4. Use barrel exports (`index.ts`) for clean package APIs
5. Prefer Server Components; mark 'use client' only when necessary
6. Follow existing patterns in `apps/web/components/ui/` for new UI components


