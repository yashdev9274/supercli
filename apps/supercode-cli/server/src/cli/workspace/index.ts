/**
 * Workspace package — scan, system prompt, chalk banners.
 * Public API is stable; internals live in scanner/context/format/prompt.
 */
export {
  scanWorkspace,
  readProjectConfig,
  type FileNode,
  type WorkspaceInfo,
} from "./scanner.ts"
export {
  buildSystemPrompt,
  shortWorkspaceSummary,
  chatModeTail,
  planModeTail,
  progressDisplaySection,
} from "./context.ts"
export {
  renderWorkspaceBanner,
  renderFileTree,
} from "./format.ts"
