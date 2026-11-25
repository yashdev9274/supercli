import { defineAgent, defineDynamic } from "eve"
import { novaAgentPolicy } from "../../../../lib/agent"
import { createTenantCodexModel } from "../../../../lib/codex-selection"
import { scopeFromPrincipal } from "../../../../lib/scope"
import { fixtures } from "../lib/fixtures"

const recoveryFetch: typeof fetch = (async (url, init) => {
  const fixture = fixtures[0]
  const directory = process.env.NOVA_TEST_RECOVERY_DIR
  if (directory && String(url).endsWith("/responses")) {
    const { open, appendFile } = await import("node:fs/promises")
    const { join } = await import("node:path")
    await appendFile(join(directory, "inference-attempts"), "attempt\n")
    let marker
    try { marker = await open(join(directory, "inference-held"), "wx") } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
    if (marker) {
      await marker.close()
      await new Promise<void>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("fixture aborted")), { once: true }))
    }
  }
  return fixture.fetcher(url, init)
}) as typeof fetch

export default defineAgent({
  ...novaAgentPolicy,
  model: defineDynamic((ctx) => {
    const scope = scopeFromPrincipal(ctx.session.auth.current)
    const fixture = fixtures.find((entry) => entry.scope.novaSessionId === scope?.novaSessionId)
    if (!scope || !fixture) throw new Error("Scoped fixture principal required")
    return {
      model: createTenantCodexModel(scope, { scopeStore: fixture.scopeStore, context: async () => fixture.context, fetch: process.env.NOVA_TEST_RECOVERY_DIR ? recoveryFetch : fixture.fetcher, env: fixture.env }),
      modelContextWindowTokens: 128_000,
    }
  }),
})
