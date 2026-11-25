import { defineEval } from "eve/evals"
import { equals, includes } from "eve/evals/expect"
import type config from "./evals.config"

export default defineEval<typeof config>({
  description: "Separate specialist contexts use only read tools and return reports to their parent",
  async test(t) {
    const turn = await t.send("Run all three specialists without changing files")
    t.succeeded()
    t.calledTool("consult_specialist")
    t.eventsSatisfy("Recorded local specialist lineage", (events) => {
      const children = events.filter((event) => event.type === "child.opened")
      return children.length === 3 && new Set(children.map((event) => event.data.name)).size === 3 && new Set(children.map((event) => event.data.sessionId)).size === 3
        && children.every((event) => ["explorer", "implementer", "verifier"].includes(event.data.name) && event.data.stream === `/eve/v1/session/${event.data.sessionId}/stream`)
    })
    t.check(turn.reply, includes("Specialists reviewed"))
    t.check(t.context.counts.reads, equals(3))
    t.check(t.context.counts.writes, equals(0))
    t.check(t.context.counts.validations, equals(0))
    t.check(t.context.counts.exports, equals(0))
  },
})
