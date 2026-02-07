# Monorepo Setup Spec (SuperCLI + Supercode)

## Target structure

```txt
apps/
  web/
    app/
      dashboard/
        reviews/
        agents/
      (auth)/
      api/
  api/
  supercode-cli/
packages/
  ui/
  auth/
  db/
    prisma/
      schema.prisma
      migrations/
  sdk/
  dashboard/
  config/
turbo.json
package.json
```

## Product boundaries
- SuperCLI: `/dashboard/reviews`
- Supercode: `/dashboard/agents`
- Shared concerns: auth, org/workspace, billing, dashboard shell

## Ownership rules
- `packages/db` owns all migrations
- `packages/auth` owns auth/session logic
- `packages/sdk` is the API contract layer for web + cli
