import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return false
  const env = readFileSync(envPath, "utf-8")
  for (const line of env.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
  return true
}

// Try CWD .env first, then file-relative paths for bundled/global install
const __dirname = dirname(fileURLToPath(import.meta.url))
const cwdEnv = resolve(process.cwd(), ".env")
const pkgEnv = resolve(__dirname, "../../.env")        // dev: src/lib/ -> server/.env
const distEnv = resolve(__dirname, "../.env")           // prod: dist/ -> server/.env

try {
  loadEnvFile(cwdEnv) || loadEnvFile(pkgEnv) || loadEnvFile(distEnv)
} catch {}
