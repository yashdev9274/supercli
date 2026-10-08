#!/usr/bin/env bun
/**
 * prisma migrate deploy with retries for transient advisory-lock timeouts (P1002).
 * Uses packages/db/prisma.config.ts (direct/unpooled URL for Neon).
 */
import { spawn } from "node:child_process"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir)
const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 3_000

function runMigrate(): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "bunx",
      ["prisma", "migrate", "deploy", "--config", "./prisma.config.ts"],
      {
        cwd: ROOT,
        env: process.env,
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
    || output.includes("Can't reach database server")
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const url =
  process.env.DATABASE_URL_UNPOOLED
  || process.env.DIRECT_URL
  || process.env.DIRECT_DATABASE_URL
  || process.env.POSTGRES_URL_NON_POOLING
  || process.env.DATABASE_URL
  || ""

if (url.includes("-pooler.") && !process.env.DATABASE_URL_UNPOOLED && !process.env.DIRECT_URL) {
  console.warn(
    "[db:migrate] DATABASE_URL looks pooled (Neon -pooler). "
      + "prisma.config.ts will strip -pooler for migrate. "
      + "Prefer setting DATABASE_URL_UNPOOLED or DIRECT_URL on Vercel.",
  )
}

let attempt = 0
while (attempt < MAX_ATTEMPTS) {
  attempt += 1
  console.log(`[db:migrate] attempt ${attempt}/${MAX_ATTEMPTS}`)
  const { code, output } = await runMigrate()
  if (code === 0) {
    console.log("[db:migrate] success")
    process.exit(0)
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
