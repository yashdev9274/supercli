import { defineEval } from "eve/evals"
import { equals } from "eve/evals/expect"
import { submitRemoteTurn, readRemoteBatch } from "@super/nova-runtime/remote"
import { fixtureScope } from "../../../codex-fixture"
import { secret } from "../lib/fixtures"
import { projectEveEvent, eventCursor, type EveProjectionState } from "../../../../../web/modules/nova/eve/projection"

export default defineEval({
  description: "Nova admission retries reuse one Eve execution after the request reader disconnects",
  async test(t) {
    const config = { origin: t.target.url.replace(/\/$/, ""), secret }
    const scope = fixtureScope("two")
    const operation = `nova-eve:${crypto.randomUUID()}`
    const [first, retry] = await Promise.all([
      submitRemoteTurn(config, scope, "Verify capabilities", operation),
      submitRemoteTurn(config, scope, "Verify capabilities", operation),
    ])
    t.check(first, equals(retry))
    const batch = await readRemoteBatch(config, scope, first, 0)
    t.check(batch.events.filter((event) => event.type === "model.started").length, equals(2))
    t.check(batch.events.filter((event) => event.type === "call.settled").length, equals(1))
    t.check(batch.events.some((event) => event.type === "turn.settled" && event.data.outcome === "completed"), equals(true))
    t.check(batch.events.filter((event) => event.type === "delivery.admitted").length, equals(1))
    const state: EveProjectionState = { runtimeSessionId: first, nextLine: 0, replyParts: {} }
    const seen = new Set<string>()
    for (const event of [...batch.events, ...batch.events]) {
      const cursor = eventCursor("run", event.meta.position.line, event.meta.position.index)
      if (seen.has(cursor)) continue
      seen.add(cursor)
      projectEveEvent(event, state)
    }
    t.check(Object.values(state.replyParts).join("\n").includes("Runtime verified:"), equals(true))
  },
})
