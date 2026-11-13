import { spawn } from "node:child_process"

const env = { ...process.env, INNGEST_DEV: "1" }
const processes = [
  spawn("bun", ["run", "dev:web"], { env, stdio: "inherit" }),
  spawn("bun", ["run", "dev:inngest"], { env, stdio: "inherit" }),
]

function shutdown(signal: NodeJS.Signals) {
  for (const child of processes) child.kill(signal)
}

process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))

for (const child of processes) {
  child.once("exit", (code, signal) => {
    if (signal) shutdown(signal)
    else if (code && code !== 0) shutdown("SIGTERM")
  })
}
