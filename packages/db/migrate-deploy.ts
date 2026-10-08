#!/usr/bin/env bun
/**
 * prisma migrate deploy hardened for Neon + Vercel.
 *
 * - Prefer unpooled / direct DB URL (PgBouncer cannot hold session advisory locks)
 * - Strip Neon `-pooler.` hosts when only DATABASE_URL is set
 * - On Vercel/CI, disable migrate advisory locking (P1002 under concurrent previews)
 * - Retry transient connectivity / lock errors
 */
import { spawn } from "node:child_process"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir)
const MAX_ATTEMPTS = 6
const BASE_DELAY_MS = 4_000

function stripPooler(url: string): string {
  try {
    const parsed = new URL(url)
    // ep-xxx-pooler.region.aws.neon.tech → ep-xxx.region.aws.neon.tech
    if (parsed.hostname.includes("-pooler.")) {
      parsed.hostname = parsed.hostname.replace("-pooler.", ".")
    }
    // Some Neon URLs use pooler as a label elsewhere
    parsed.hostname = parsed.hostname.replace(/\.pooler\./g, ".")
    parsed.searchParams.delete("pgbouncer")
    parsed.searchParams.delete("connection_limit")
    parsed.searchParams.delete("pool_timeout")
    return parsed.toString()
  } catch {
    return url.replace("-pooler.", ".").replace(".pooler.", ".")
  }
}

function redactedHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return "(invalid-url)"
  }
}

function resolveMigrateUrl(): string {
  const candidates = [
    process.env.DATABASE_URL_UNPOOLED,
    process.env.DIRECT_URL,
    process.env.DIRECT_DATABASE_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL,
  ]
  for (const value of candidates) {
    const raw = value?.trim()
    if (!raw) continue
    return stripPooler(raw)
  }
  throw new Error(
    "No database URL set for migrate. Expected DATABASE_URL_UNPOOLED, DIRECT_URL, or DATABASE_URL.",
  )
}

function runMigrate(env: NodeJS.ProcessEnv): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "bunx",
      ["prisma", "migrate", "deploy", "--config", "./prisma.config.ts"],
      {
        cwd: ROOT,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    let output = ""
    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    }
    child.stdout.on("data", onChunk)
    child.stderr.on("data", onChunk)
    child.on("close", (code) => resolve({ code: code ?? 1, output }))
    child.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[db:migrate]", message)
      resolve({ code: 1, output: message })
    })
  })
}

function isRetryable(output: string): boolean {
  return (
    output.includes("P1002")
    || output.includes("advisory lock")
    || output.includes("Timed out trying to acquire")
    || output.includes("40P01")
    || output.includes("ECONNRESET")
    || output.includes("ECONNREFUSED")
    || output.includes("Can't reach database server")
    || output.includes("Connection terminated")
    || output.includes("server closed the connection")
    || output.includes("timeout expired")
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const onVercel = process.env.VERCEL === "1" || process.env.CI === "true"
const migrateUrl = resolveMigrateUrl()

console.log(`[db:migrate] host=${redactedHost(migrateUrl)} vercel=${onVercel ? "yes" : "no"}`)

// Force both the Prisma config candidates and the classic env name to the direct URL.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DATABASE_URL: migrateUrl,
  DATABASE_URL_UNPOOLED: migrateUrl,
  DIRECT_URL: migrateUrl,
  DIRECT_DATABASE_URL: migrateUrl,
}

// Session advisory locks break under Neon pooler and concurrent Vercel previews.
// migrate deploy is still serialized by _prisma_migrations rows; disabling the lock
// avoids P1002 when another preview holds/drops the lock mid-deploy.
if (onVercel || process.env.PRISMA_MIGRATE_DISABLE_LOCK === "1") {
  env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1"
  console.log("[db:migrate] PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1")
}

let attempt = 0
while (attempt < MAX_ATTEMPTS) {
  attempt += 1
  console.log(`[db:migrate] attempt ${attempt}/${MAX_ATTEMPTS}`)
  const { code, output } = await runMigrate(env)
  if (code === 0) {
    console.log("[db:migrate] success")
    process.exit(0)
  }

  // If lock failed even with disable flag unset path, force-disable and retry immediately.
  if (
    (output.includes("P1002") || output.includes("advisory lock"))
    && env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK !== "1"
  ) {
    env.PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK = "1"
    console.warn("[db:migrate] enabling PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK after lock timeout")
    continue
  }

  if (!isRetryable(output) || attempt >= MAX_ATTEMPTS) {
    console.error("[db:migrate] failed")
    process.exit(code)
  }

  const delay = BASE_DELAY_MS * attempt
  console.warn(`[db:migrate] retryable error; waiting ${delay}ms`)
  await sleep(delay)
}

process.exit(1)
