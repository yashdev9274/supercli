import { z } from "zod"
import { ToolLoopAgent, stepCountIs, tool } from "ai"
import type { LanguageModel } from "ai"
import { writeFileTool } from "../tools/definitions/write-file"
import { runCommandTool } from "../tools/definitions/run-command"

const agentInstructions = `You are a full-stack coding agent that creates complete, production-ready applications.

YOUR WORKFLOW (follow exactly):
1. PLAN — Decide the project structure, tech stack, and all files needed
2. CREATE DIRS — Use run_command({ command: "mkdir -p <paths>" }) to create the directory structure
3. WRITE FILES — Use write_file for each source file with complete, working code
4. INSTALL DEPS — Use run_command({ command: "npm install", cwd: "<dir>" }) to install dependencies
5. BUILD — Use run_command({ command: "npm run build", cwd: "<dir>" }) to verify the build

CRITICAL RULES:
- NEVER output shell commands as text. Use run_command tool instead.
- NEVER tell the user to "cd into the directory" — you already created it.
- Generate COMPLETE source files — no placeholders, no "// TODO", no "...rest of file".
- Include package.json with all dependencies and scripts.
- Include configuration files (tsconfig.json, vite.config.ts, .gitignore, etc.).
- After writing all files, run npm install.
- After install, run npm run build to verify.
- If build fails, fix the errors and rebuild.
- Only report success when the build passes.
- Use the cwd parameter in run_command — do NOT use "cd" in command strings.
- For scaffolding, use npx --yes <package> with interactive: true.`

export function createAppAgent(model: LanguageModel) {
  return new ToolLoopAgent({
    model,
    instructions: agentInstructions,
    tools: {
      write_file: tool({
        description: writeFileTool.description,
        inputSchema: writeFileTool.parameters,
        execute: async (input: any) => writeFileTool.execute(input),
      }),
      run_command: tool({
        description: runCommandTool.description,
        inputSchema: runCommandTool.parameters,
        execute: async (input: any) => runCommandTool.execute(input),
      }),
    },
    stopWhen: stepCountIs(50),
  })
}
