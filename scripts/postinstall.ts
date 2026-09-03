#!/usr/bin/env bun

const fallbackUrl = "postgresql://postgres:postgres@localhost:5432/supercode"

// Generate Prisma clients on install so typecheck and dev work without a
// live database. Generation only embeds the connection URL, so a fallback
// is safe here; errors are non-fatal to keep installs resilient.
process.env.DATABASE_URL ||= fallbackUrl

console.log("Running postinstall...")

try {
  console.log("  Generating Prisma clients...")
  const { execSync } = require("node:child_process")
  execSync("bun run --cwd packages/db db:generate", { stdio: "inherit" })
  execSync("bun run --cwd packages/db-terminal db:generate", { stdio: "inherit" })
  execSync("bun run --cwd packages/superdesign-db db:generate", { stdio: "inherit" })
  console.log("  Prisma clients generated")
} catch (err) {
  console.warn("  Prisma client generation failed — continuing without generated clients:", err)
}

console.log("postinstall complete")
