#!/usr/bin/env bun

/**
 * Monorepo postinstall.
 * Always generate Prisma clients into stable package outputs so Vercel/bun
 * do not depend on which @prisma/client hash got the default engine.
 */
import { execSync } from "node:child_process"

// Generation only embeds the connection URL, so a fallback is safe here;
// typecheck and dev then work without a live database.
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@localhost:5432/supercode"

console.log("Running postinstall...")

const steps: Array<{ label: string; cwd: string; cmd: string }> = [
  { label: "@super/db", cwd: "packages/db", cmd: "bun run db:generate" },
  { label: "@super/db-terminal", cwd: "packages/db-terminal", cmd: "bun run db:generate" },
]

for (const step of steps) {
  try {
    console.log(`  Generating Prisma client (${step.label})...`)
    execSync(step.cmd, { cwd: step.cwd, stdio: "inherit", env: process.env })
  } catch (err) {
    console.warn(`  Warning: failed to generate ${step.label} — build scripts may regenerate.`)
    console.warn(`  ${err instanceof Error ? err.message : String(err)}`)
  }
}

console.log("postinstall complete")
