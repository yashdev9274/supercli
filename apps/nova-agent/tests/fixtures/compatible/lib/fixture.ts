import { compatibleFixture } from "../../../compatible-fixture"

export const fixture = compatibleFixture()
export const secret = "synthetic-compatible-eve-scope-secret-no-production"
export const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
