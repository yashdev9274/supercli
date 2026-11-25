import { codexFixture, fixtureScope } from "../../../codex-fixture"
import type { NovaScopeStore } from "../../../../lib/scope"

export const secret = "synthetic-eve-codex-scope-key-never-for-production"
export const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
export const fixtures = [codexFixture(fixtureScope("one")), codexFixture(fixtureScope("two"))]
export const scopeStore: NovaScopeStore = { async findSession(id) {
  const fixture = fixtures.find((entry) => entry.scope.novaSessionId === id)
  return fixture ? fixture.scopeStore.findSession(id) : null
}, async findConnection(scope) {
  const fixture = fixtures.find((entry) => entry.scope.novaSessionId === scope.novaSessionId)
  return await fixture?.scopeStore.findConnection?.(scope) ?? null
} }
