import { defineEval } from "eve/evals"
import { includes } from "eve/evals/expect"

export default defineEval({
  description: "Run an actual Eve model/tool continuation with a deterministic, offline model",
  async test(t) {
    const turn = await t.send("Verify the runtime capabilities")
    t.succeeded()
    t.calledTool("runtime_info")
    t.check(turn.reply, includes("Runtime verified:"))
    t.check(turn.reply, includes('"repositoryAccess":false'))
  },
})
