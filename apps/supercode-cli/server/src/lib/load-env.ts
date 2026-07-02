import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

let _loaded = false

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return false
  const raw = readFileSync(envPath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
  return true
}

export function loadEnvOnce() {
  if (_loaded) return
  _loaded = true

  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), "..", "..", ".env"),
  ]
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    candidates.push(resolve(dir, ".env"))
    dir = resolve(dir, "..")
  }

  const seen = new Set<string>()
  for (const path of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    if (loadEnvFile(path)) break
  }
}
