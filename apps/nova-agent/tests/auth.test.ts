import { expect, test } from "bun:test"
import { authenticateRuntime } from "../lib/auth"
import { createNovaAgent } from "../lib/agent"

const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SERVICE_PASSWORD: "synthetic-test-password" }
const request = (user = "nova-runtime", password = env.NOVA_EVE_SERVICE_PASSWORD) => new Request("http://localhost/eve/v1/sessions", {
  headers: { authorization: `Basic ${btoa(`${user}:${password}`)}` },
})

test("disabled or unconfigured runtime rejects even a valid credential", () => {
  expect(authenticateRuntime(request(), {})).toBeNull()
  expect(authenticateRuntime(request(), { ...env, NOVA_EVE_ENABLED: "false" })).toBeNull()
  expect(authenticateRuntime(request(), { NOVA_EVE_ENABLED: "true" })).toBeNull()
})

test("missing, incorrect and browser-cookie credentials cannot authorize a session", () => {
  expect(authenticateRuntime(new Request("http://localhost", { headers: { cookie: "session=synthetic" } }), env)).toBeNull()
  expect(authenticateRuntime(request("other"), env)).toBeNull()
  expect(authenticateRuntime(request("nova-runtime", "wrong"), env)).toBeNull()
})

test("valid service credentials authenticate without leaking the password", () => {
  const principal = authenticateRuntime(request(), env)
  expect(principal).not.toBeNull()
  expect(JSON.stringify(principal)).not.toContain(env.NOVA_EVE_SERVICE_PASSWORD)
})

test("compatibility agent exposes no optional default tools or root-copy subagent", () => {
  const agent = createNovaAgent("openai/gpt-5.4-mini")
  expect(agent.defaultTools).toBe(false)
  expect(agent.tool).toBe(false)
})
