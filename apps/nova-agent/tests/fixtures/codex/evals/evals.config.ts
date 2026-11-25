import { defineEvalConfig } from "eve/evals"

export default defineEvalConfig({ timeoutMs: 60_000, maxConcurrency: 1 })
