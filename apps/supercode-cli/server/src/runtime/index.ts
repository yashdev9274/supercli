/**
 * Shared agent/CLI runtime layer.
 * In-scope stream, workspace, config, research, and quality helpers live here.
 * Frozen auth/billing/prisma modules stay under `src/lib` and are never rehomed.
 */

export {
  createThinkSplitter,
  splitThinkContent,
  looksLikeProcessScratch,
  finalizeAnswerVsProcess,
  type ThinkSplit,
} from "./stream/split-think-content.ts"

export * from "./stream/embedded-tool-calls.ts"
export * from "./stream/openai-compatible-stream.ts"
export * from "./stream/proxy-tools.ts"

export * from "./workspace/workspace.ts"
export * from "./workspace/file-search.ts"
export * from "./workspace/scratch.ts"

export * from "./config/cli-config.ts"
export * from "./config/load-env.ts"
export * from "./config/context-enforcer.ts"
export * from "./config/token-budget.ts"
export * from "./config/request-counter.ts"

export * from "./research/exa.ts"
export * from "./research/firecrawl.ts"

export * from "./quality/citation-tracker.ts"

export { type TurnEvent, type TurnEventListener, createEventBus } from "./events.ts"
