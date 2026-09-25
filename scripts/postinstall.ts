#!/usr/bin/env bun

/**
 * Monorepo postinstall.
 * Always generate Prisma clients into stable package outputs so Vercel/bun
 * do not depend on which @prisma/client hash got the default engine.
 */
import { execSync } from "node:child_process"

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
