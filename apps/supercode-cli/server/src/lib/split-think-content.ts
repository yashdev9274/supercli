/**
 * Re-export shim — implementation lives in `src/runtime/stream/split-think-content.ts`.
 * Kept so existing CLI/server imports continue to compile during the redesign.
 */
export {
  createThinkSplitter,
  splitThinkContent,
  looksLikeProcessScratch,
  finalizeAnswerVsProcess,
  type ThinkSplit,
} from "../runtime/stream/split-think-content.ts"
