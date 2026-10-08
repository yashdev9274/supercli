import { defineConfig } from "prisma/config"

/**
 * Prefer a direct (unpooled) Postgres URL for Prisma Migrate.
 * Neon/PgBouncer pooler URLs cannot hold session-scoped advisory locks, which
 * surfaces on Vercel as P1002: "Timed out trying to acquire a postgres advisory lock".
 *
 * App runtime keeps using DATABASE_URL (pooled) via @prisma/adapter-pg.
 */
function migrateDatabaseUrl(): string {
  const candidates = [
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DIRECT_URL,
    process.env.DIRECT_DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
  ]

  for (const value of candidates) {
    const url = value?.trim()
    if (!url) continue
    return stripPooler(url)
  }

  return "postgresql://postgres:postgres@localhost:5432/postgres"
}

/** Neon pooler host: ep-xxx-pooler.region... → ep-xxx.region... */
function stripPooler(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes("-pooler.")) {
      parsed.hostname = parsed.hostname.replace("-pooler.", ".")
    }
    // PgBouncer query flags are meaningless / harmful on a direct connection.
    parsed.searchParams.delete("pgbouncer")
    return parsed.toString()
  } catch {
    return url.replace("-pooler.", ".")
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrateDatabaseUrl(),
  },
})
