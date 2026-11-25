import { expect, test } from "bun:test"
import { SPECIALIST_ROLES, SPECIALIST_READ_TOOLS, specialistCanUseTool } from "@super/nova-runtime/specialists"
import { repositoryTools } from "../lib/repository-tools"
import { fixtureScope } from "./codex-fixture"
import { canConsultSpecialist } from "../lib/specialist-policy"
import { readFileSync } from "node:fs"

test("every specialist receives a closed read-only repository tool set", () => {
  const scope = { ...fixtureScope(), repositoryRunId: "run" }
  for (const role of SPECIALIST_ROLES) {
    expect(Object.keys(repositoryTools(scope, role))).toEqual([...SPECIALIST_READ_TOOLS])
    for (const name of SPECIALIST_READ_TOOLS) expect(specialistCanUseTool(role, name)).toBe(true)
    for (const name of ["write_file", "edit_file", "run_command", "code_exec", "repository_verify", "repository_finish", "explorer"]) expect(specialistCanUseTool(role, name)).toBe(false)
  }
  expect(specialistCanUseTool("unknown", "read_file")).toBe(false)
  expect(Object.keys(repositoryTools(scope))).toContain("repository_finish")
})

test("delegation remains disabled outside a scoped root repository turn", () => {
  const principal = { authenticator: "nova-scope", issuer: "nova", principalType: "user", attributes: { repositoryRunId: "run" } }
  const env = { NOVA_EVE_SPECIALISTS_ENABLED: "true", NOVA_EVE_REPOSITORY_ENABLED: "true" }
  expect(canConsultSpecialist(principal, false, env)).toBe(true)
  expect(canConsultSpecialist(principal, true, env)).toBe(false)
  expect(canConsultSpecialist(principal, false, {})).toBe(false)
  expect(canConsultSpecialist(null, false, env)).toBe(false)
  expect(canConsultSpecialist({ ...principal, attributes: {} }, false, env)).toBe(false)
  expect(canConsultSpecialist({ ...principal, authenticator: "http-basic" }, false, env)).toBe(false)
})

test("the compiled eval tool matches the production workflow rather than testing a second implementation", () => {
  const production = readFileSync(new URL("../agent/tools/consult_specialist.ts", import.meta.url), "utf8")
  const fixture = readFileSync(new URL("./fixtures/specialists/agent/tools/consult_specialist.ts", import.meta.url), "utf8")
  expect(fixture.replaceAll("../../../../../lib/", "../../lib/")).toBe(production)
})
