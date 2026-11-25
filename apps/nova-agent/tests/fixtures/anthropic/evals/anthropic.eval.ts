import { Client } from "eve/client"
import { defineEval } from "eve/evals"
import { equals, includes } from "eve/evals/expect"
import { signNovaScope } from "../../../../lib/scope"
import { fixture, secret } from "../lib/fixture"

export default defineEval({
  description: "Eve reconstructs Anthropic-native tool continuation across persisted steps",
  async test(t) {
    const client = new Client({ baseUrl: t.target.url, headers: { authorization: `Bearer ${signNovaScope(fixture.scope, { secret })}` } })
    const { delivery } = await client.sessions.create({ message: "Verify capabilities" })
    let reply = ""
    let calls = 0
    let rounds = 0
    for await (const event of delivery.stream()) {
      if (event.type === "model.started") rounds++
      if (event.type === "call.settled") calls++
      if (event.type === "content.completed" && event.data.phase === "reply") reply = String(event.data.value)
    }
    t.check(reply, includes("Anthropic verified 👋"))
    t.check(rounds, equals(2))
    t.check(calls, equals(1))
  },
})
