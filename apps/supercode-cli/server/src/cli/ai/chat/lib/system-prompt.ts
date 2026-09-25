/**
 * Assemble the per-turn system prompt for chalk chat streaming.
 */
import { agentService, loadPrompt } from "src/agents/index.ts"
import type { WorkspaceInfo } from "src/cli/workspace/scanner.ts"
import {
  buildSystemPrompt,
  chatModeTail,
  planModeTail,
  progressDisplaySection,
} from "src/cli/workspace/context.ts"
import {
  loadedSkillName,
  getLoadedSkillContent,
} from "./skill-state.ts"

export async function assembleStreamSystemPrompt(opts: {
  workspaceInfo: WorkspaceInfo
  mode: string
  extraContext?: string
}): Promise<string> {
  const { workspaceInfo, mode, extraContext } = opts
  const hasTools = mode === "agent" || mode === "chat" || mode === "plan"
  let promptContent = buildSystemPrompt(workspaceInfo, hasTools)

  const agentForMode =
    mode === "agent"
      ? agentService.get("build")
      : mode === "plan"
        ? agentService.get("plan")
        : undefined

  if (agentForMode?.info.prompt) {
    const agentPrompt = await loadPrompt(agentForMode.info.prompt)
    if (agentPrompt) {
      promptContent += `\n\n## ${agentForMode.info.name} agent\n\n${agentPrompt}\n`
    }
  }

  if (mode === "chat") promptContent += chatModeTail()
  if (mode === "plan") promptContent += planModeTail()

  // Progress/Result separation — all modes
  promptContent += "\n\n" + progressDisplaySection().join("\n")

  if (extraContext) {
    promptContent += `\n\n## Referenced Files\n\nFiles marked with @ in the user message have been read and included below. Do not re-read them with tools.\n\n${extraContext}\n`
  }

  const skillContent = getLoadedSkillContent()
  if (skillContent) {
    promptContent += `\n\n## Loaded Skill: ${loadedSkillName || "unknown"}\n\n${skillContent}\n`
  }

  return promptContent
}
