import { createHash } from "node:crypto"
import { createCodexRuntime } from "@super/codex-runtime/runtime"
import { createPrismaCodexStore } from "@super/codex-runtime/store"
import { configuredCodexVault } from "@super/codex-runtime/vault"
import type { CodexCredentialContext } from "@super/codex-runtime/credentials"

import { createEveCodexModel } from "./codex-model"
import { authorizeNovaScope, type NovaScope, type NovaScopeStore } from "./scope"
import { createPrismaScopeStore, providerConnectionId } from "./scope-store"

export function createTenantCodexModel(scope: NovaScope, dependencies: {
  scopeStore?: NovaScopeStore
  context?: () => Promise<CodexCredentialContext>
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
} = {}) {
  if (scope.provider !== "codex") throw new Error("The Codex adapter cannot execute another provider")
  const scopeStore = dependencies.scopeStore ?? createPrismaScopeStore()
  const owner = { userId: scope.userId, organizationId: scope.organizationId, membershipId: scope.membershipId, sessionId: scope.novaSessionId }
  const identity = createHash("sha256").update(JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, scope.novaSessionId, scope.connectionId])).digest("base64url")
  return createEveCodexModel({
    model: scope.model,
    scope: identity,
    async authorize(signal) {
      signal?.throwIfAborted()
      if ((dependencies.env ?? process.env).NOVA_EVE_ENABLED !== "true" || !await authorizeNovaScope(scope, scopeStore)) throw new Error("Nova session access is no longer authorized")
      const context = dependencies.context ? await dependencies.context() : {
        owner,
        store: await createPrismaCodexStore(owner),
        vault: configuredCodexVault,
      }
      if (context.owner.userId !== owner.userId || context.owner.organizationId !== owner.organizationId || context.owner.membershipId !== owner.membershipId) throw new Error("Codex credential owner does not match the Nova session")
      const boundContext = {
        ...context,
        store: {
          ...context.store,
          async get() {
            const row = await context.store.get()
            if (!row.connectedAt || providerConnectionId(owner.membershipId, "codex", row.connectedAt.toISOString()) !== scope.connectionId) throw new Error("Codex connection changed; authorize the new connection before continuing")
            return row
          },
        },
      }
      return createCodexRuntime(boundContext, dependencies.fetch).prepareNative(scope.model, scope.effort, signal)
    },
  })
}
