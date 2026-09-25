/**
 * CLI chalk utilities. Prefer OpenTUI (`src/cli/tui`) for new interactive UI.
 * Theme is shared via `./theme`.
 */
export { theme, type Theme } from "./theme/index.ts"
export { renderWelcome } from "./welcome.ts"
export { MarkdownStream } from "./markdown-stream.ts"
export { checkForUpdate } from "./auto-update.ts"
// Re-export common tui helpers used across slash commands / chat
export {
  createThinking,
  userMessage,
  streamFooter,
  streamHeader,
  frame,
  sectionHeader,
  cardStack,
  rowCard,
  heavyDivider,
  statusBar,
  hudPanel,
  pixelWordmark,
  banner,
  gradientText,
} from "./tui.ts"
