import { Client } from "eve/client"
import { defineEval } from "eve/evals"
import { equals, includes } from "eve/evals/expect"
import { signNovaScope } from "../../../../lib/scope"
import { fixtureScope } from "../../../codex-fixture"
import { secret } from "../lib/fixtures"

export default defineEval({
  description: "Eve persists Codex native reasoning across a tool step and enforces tenant ownership",
  async test(t) {
    const client = (user: string) => new Client({ baseUrl: t.target.url, headers: { authorization: `Bearer ${signNovaScope(fixtureScope(user), { secret })}` } })
    const owner = client("one")
    const { session, delivery } = await owner.sessions.create({ message: "Verify runtime capabilities" })
    let reply = ""
    let rounds = 0
    let calls = 0
    for await (const event of delivery.stream()) {
      if (event.type === "model.started") rounds++
      if (event.type === "call.settled") calls++
      if (event.type === "content.completed" && event.data.phase === "reply") reply = String(event.data.value)
    }
    t.check(reply, includes("Runtime verified:"))
    t.check(rounds, equals(2))
    t.check(calls, equals(1))
    const stranger = client("two").sessions.attach(session.id)
    for (const attempt of [() => stranger.snapshot(), () => stranger.send("Overwrite the owner's request"), () => stranger.cancel()]) {
      let denied = false
      try { await attempt() } catch { denied = true }
      t.check(denied, equals(true))
    }
    const unauthorized = new Client({ baseUrl: t.target.url, headers: { authorization: "Bearer forged" } })
    let rejected = false
    try { await unauthorized.sessions.create({ message: "Must be rejected" }) } catch { rejected = true }
    t.check(rejected, equals(true))
    await session.end()
  },
})
