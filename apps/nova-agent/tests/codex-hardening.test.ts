import { expect, test } from "bun:test"
import { createEveCodexModel } from "../lib/codex-model"
import { signNovaScope, verifyNovaScopeToken, authorizeNovaScope } from "../lib/scope"
import { codexFixture } from "./codex-fixture"
import { createHmac } from "node:crypto"

test("Codex cannot use the legacy unbound scope through signing, verification or authorization", async () => {
  const fixture = codexFixture()
  const unbound = { ...fixture.scope }
  Reflect.deleteProperty(unbound, "connectionId")
  const secret = "synthetic-hardening-scope-secret-32-bytes-minimum"
  expect(() => signNovaScope(unbound, { secret })).toThrow("Invalid scope")
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const iat = Math.floor(Date.now() / 1000)
  const raw = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...unbound, iss: "nova", aud: "nova-eve", iat, exp: iat + 60 })}`
  const token = `${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`
  expect(verifyNovaScopeToken(token, { secret })).toBeNull()
  expect(await authorizeNovaScope(unbound, fixture.scopeStore)).toBe(false)
  expect(await authorizeNovaScope(fixture.scope, { findSession: fixture.scopeStore.findSession })).toBe(false)
})

test("unsupported provider options fail before credential lookup or inference", async () => {
  let authorized = 0
  const model = createEveCodexModel({
    model: "fixture-model", scope: "fixture",
    authorize: async () => { authorized++; throw new Error("must not reach credentials") },
  })
  const prompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "test" }] }]
  for (const options of [
    { responseFormat: { type: "json" as const } },
    { responseFormat: { type: "json" as const, schema: { type: "object" as const, properties: {} } } },
    { maxOutputTokens: 100 }, { temperature: 0 }, { stopSequences: [] }, { topP: 1 },
    { topK: 1 }, { presencePenalty: 0 }, { frequencyPenalty: 0 }, { seed: 0 },
  ]) {
    const { stream } = await model.doStream({ prompt, ...options })
    const reader = stream.getReader()
    await expect(reader.read()).rejects.toThrow("does not support")
    reader.releaseLock()
    await expect(model.doGenerate({ prompt, ...options })).rejects.toThrow("does not support")
  }
  expect(authorized).toBe(0)
})
