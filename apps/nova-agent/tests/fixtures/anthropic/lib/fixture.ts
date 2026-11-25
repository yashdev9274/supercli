import { anthropicFixture } from "../../../anthropic-fixture"

export const fixture = anthropicFixture()
export const secret = "synthetic-anthropic-eve-scope-secret-no-production"
export const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
