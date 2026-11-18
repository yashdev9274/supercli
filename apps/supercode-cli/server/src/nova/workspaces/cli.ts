import { statSync } from "node:fs"
import { isAbsolute } from "node:path"
import { approvedWorkspaceOrigin, startWorkspaceCompanion } from "./server"

export function parseWorkspaceArgs(args: string[]): { roots: string[]; origins: string[]; port: number } {
  const roots: string[] = []
  const origins: string[] = []
  let port = 47832
  let portSeen = false
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error("Each option requires a value")
    if (flag === "--project") {
      if (!isAbsolute(value) || !statSync(value).isDirectory()) throw new Error("Projects must be existing absolute directories")
      roots.push(value)
    } else if (flag === "--origin") {
      if (!approvedWorkspaceOrigin(value)) throw new Error("Origins must be exact HTTP loopback or HTTPS origins")
      origins.push(value)
    } else if (flag === "--port") {
      if (portSeen || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error("Invalid port")
      port = Number(value)
      portSeen = true
    } else {
      throw new Error("Unknown option")
    }
  }
  if (!roots.length || !origins.length) throw new Error("At least one --project and --origin are required")
  return { roots: [...new Set(roots)], origins: [...new Set(origins)], port }
}

if (import.meta.main) {
  try {
    const companion = startWorkspaceCompanion(parseWorkspaceArgs(Bun.argv.slice(2)))
    console.log(`Nova workspace companion: http://127.0.0.1:${companion.server.port}`)
    console.log(`Pairing code (single use): ${companion.code}`)
    const stop = () => { companion.stop(); process.exit(0) }
    process.on("SIGINT", stop)
    process.on("SIGTERM", stop)
  } catch {
    console.error("Unable to start workspace companion. Use --project /absolute/directory --origin http://localhost:3003 [--port 47832]; verify directories, exact origins, and port availability.")
    process.exitCode = 1
  }
}
