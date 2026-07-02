#!/usr/bin/env bun

const DATABASE_URL = process.env.DATABASE_URL

console.log("Running postinstall...")

if (DATABASE_URL && DATABASE_URL !== "postgresql://...") {
  console.log("  Generating Prisma clients...")
  const { execSync } = require("node:child_process")
  execSync("bun run --cwd packages/db db:generate", { stdio: "inherit" })
  execSync("bun run --cwd packages/db-terminal db:generate", { stdio: "inherit" })
  console.log("  Prisma clients generated")
} else {
  console.log("  No DATABASE_URL configured — skipping Prisma client generation")
  console.log("  To generate later: bun run db:generate")
}

console.log("postinstall complete")
