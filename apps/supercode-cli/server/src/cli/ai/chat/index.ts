/**
 * Public entrypoints for chalk chat / agent / tools sessions.
 */
export {
  startChat,
  initConversation,
  clearSkill,
  loadedSkillName,
  setLoadedSkill,
  type ModelProvider,
} from "./chat.ts"

export { startAgentChat } from "./chatAgent.ts"
export { startToolChat } from "./chatTools.ts"

// Re-export useful display helpers for tests / TUI adapters
export {
  ThinkingDisplay,
  ThoughtChain,
  TurnTracker,
  toolLabel,
  extractToolArg,
  renderReasoningBlock,
  categorizeTool,
  type ToolCategory,
} from "./thinking.ts"

export { StepStatusRow, type StepPhase } from "./step-status-row.ts"
export { AtPicker, DragDropTracker, type AtItem } from "./at-picker.ts"
