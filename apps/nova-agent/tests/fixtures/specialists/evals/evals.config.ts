import { defineEvalConfig } from "eve/evals"
import { createServer } from "node:http"
import { verifyNovaScopeToken } from "@super/nova-runtime/scope"
import { executeRepositoryOperation, type RepositoryVerification } from "../../../../../web/modules/nova/eve/repository-engine"
import { secret } from "../lib/scope"

export default defineEvalConfig({
  timeoutMs: 60_000, maxConcurrency: 1,
  async setup() {
    let digest = "a".repeat(64)
    let verified: RepositoryVerification | undefined
    const counts = { writes: 0, validations: 0, exports: 0, authenticated: 0, reads: 0 }
    const workspace = {
      async execute(name: string) {
        if (name === "read_file") { counts.reads++; return { success: true, data: { version: "v1", content: "fixture file" } } }
        if (name === "write_file") { counts.writes++; digest = "b".repeat(64); return { success: true } }
        if (name === "run_command") { counts.validations++; return { success: true, exitCode: 0, truncated: false } }
        throw new Error("Unexpected fixture operation")
      },
      async inspectChanges() { return { digest, status: "modified", diff: "fixture diff" } },
      async savePatch(expected: string) { if (digest !== expected) throw new Error("stale"); counts.exports++; return "fixture.patch" },
      async close() {},
    }
    const receipts = new Map<string, unknown>()
    const server = createServer(async (request, response) => {
      try {
        const scope = verifyNovaScopeToken((request.headers.authorization ?? "").replace(/^Bearer /, ""), { secret })
        if (scope?.repositoryRunId !== "run_fixture") { response.writeHead(403).end(); return }
        counts.authenticated++
        let body = ""
        for await (const chunk of request) body += chunk.toString()
        const operation = JSON.parse(body)
        if (!["explorer", "implementer", "verifier"].includes(operation.specialistRole) || !["read_file", "search_files", "read_instructions"].includes(operation.name)) { response.writeHead(403).end(); return }
        let result = receipts.get(`${operation.runtimeSessionId}:${operation.callId}`)
        if (!result) {
          result = await executeRepositoryOperation({ ...operation, validationCommands: ["fixture validation"], verified }, workspace)
          const proof = result as { success: boolean; data?: { verifiedDigest: string; commands: Record<string, unknown>[] } }
          if (operation.name === "repository_verify" && proof.success && proof.data) verified = { digest: proof.data.verifiedDigest, commands: proof.data.commands }
          receipts.set(`${operation.runtimeSessionId}:${operation.callId}`, result)
        }
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result))
      } catch { response.writeHead(500).end() }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing fixture address")
    const keys = ["NOVA_EVE_SPECIALISTS_ENABLED", "NOVA_EVE_REPOSITORY_ENABLED", "NOVA_EVE_SCOPE_SECRET", "NOVA_CONTROL_PLANE_URL"] as const
    const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
    process.env.NOVA_EVE_REPOSITORY_ENABLED = "true"
    process.env.NOVA_EVE_SPECIALISTS_ENABLED = "true"
    process.env.NOVA_EVE_SCOPE_SECRET = secret
    process.env.NOVA_CONTROL_PLANE_URL = `http://127.0.0.1:${address.port}`
    return { counts, async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      for (const key of keys) { if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key] }
    } }
  },
  async teardown(context) { await context?.close() },
})
