import { Client } from "eve/client"
import { defineEval } from "eve/evals"
import { equals } from "eve/evals/expect"

export default defineEval({
  description: "Disconnect a stream during a turn and observe completion from a saved cursor",
  async test(t) {
    const client = new Client({ baseUrl: t.target.url })
    const { session } = await client.sessions.create({ message: "Verify runtime capabilities" })
    const signal = AbortSignal.timeout(30_000)
    let started = false
    for await (const event of session.stream({ reconnect: false, signal })) {
      if (event.type === "model.started") {
        started = true
        break
      }
    }
    t.check(started, equals(true))
    const cursor = session.state.streamIndex
    t.check(cursor > 0, equals(true))
    const reconnected = client.sessions.attach(session.id, { streamIndex: cursor })
    let completed = false
    for await (const event of reconnected.stream({ signal })) {
      if (event.type === "content.completed" && event.data.phase === "reply") {
        completed = String(event.data.value).includes("Runtime verified:")
      }
      if (event.type === "turn.settled") break
    }
    t.check(completed, equals(true))
    t.check(reconnected.state.streamIndex > cursor, equals(true))
    await reconnected.end()
  },
})
