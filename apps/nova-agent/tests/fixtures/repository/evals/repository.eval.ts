import { defineEval } from "eve/evals"
import { equals, includes } from "eve/evals/expect"
import type config from "./evals.config"

export default defineEval<typeof config>({
  description: "Actual Eve calls signed repository tools, validates and exports a matching diff",
  async test(t) {
    const turn = await t.send("Implement and verify the fixture")
    t.succeeded()
    t.calledTool("write_file")
    t.calledTool("repository_verify")
    t.calledTool("repository_finish")
    t.check(turn.reply, includes("Verified repository fixture"))
    t.check(t.context.counts.writes, equals(1))
    t.check(t.context.counts.validations, equals(1))
    t.check(t.context.counts.exports, equals(1))
    t.check(t.context.counts.authenticated, equals(3))
  },
})
