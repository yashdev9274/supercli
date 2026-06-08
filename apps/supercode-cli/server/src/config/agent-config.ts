import { z } from "zod"
import { generateObject as aiGenerateObject } from "ai"
import chalk from "chalk"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import type { LanguageModel } from "ai"

const ApplicationSchema = z.object({
  folderName: z
    .string()
    .describe("Kebab-case folder name for the application"),
  description: z
    .string()
    .describe("Brief description of what was created"),
  files: z.array(
    z
      .object({
        path: z.string().describe("Relative file path (e.g. src/App.jsx)"),
        content: z.string().describe("Complete file content"),
      })
      .describe("All files needed for the application"),
  ),
  setupCommands: z.array(
    z
      .string()
      .describe(
        "Bash commands to setup and run (e.g. npm install, npm run dev)",
      ),
  ),
  dependencies: z.record(z.string(), z.any()).optional().describe("NPM dependencies with versions"),
})

function displayFileTree(files: { path: string }[], folderName: string) {
  console.log(chalk.cyan("\n 📁 Project Structure:"))
  console.log(chalk.white(`${folderName}/`))

  const filesByDir: Record<string, string[]> = {}
  for (const file of files) {
    const parts = file.path.split("/")
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ""

    if (!filesByDir[dir]) {
      filesByDir[dir] = []
    }
    filesByDir[dir]!.push(parts.at(-1)!)
  }

  const sortedDirs = Object.keys(filesByDir).sort()
  for (const dir of sortedDirs) {
    if (dir) {
      console.log(chalk.white(`├── ${dir}/`))
      for (const file of filesByDir[dir]!) {
        console.log(chalk.white(`│   └── ${file}`))
      }
    } else {
      for (const file of filesByDir[dir]!) {
        console.log(chalk.white(`├── ${file}`))
      }
    }
  }
}

async function createApplicationFiles(
  baseDir: string,
  folderName: string,
  files: { path: string; content: string }[],
) {
  const appDir = path.join(baseDir, folderName)

  await mkdir(appDir, { recursive: true })
  console.log(chalk.cyan(`\n📁 Created directory: ${folderName}/`))

  for (const file of files) {
    const filePath = path.join(appDir, file.path)
    const fileDir = path.dirname(filePath)

    await mkdir(fileDir, { recursive: true })
    await writeFile(filePath, file.content, "utf8")
    console.log(chalk.green(`  ✓ ${file.path}`))
  }

  return appDir
}

export async function generateApplication(
  description: string,
  modelOrGenerate: LanguageModel | ((schema: any, prompt: string) => Promise<{ object: unknown }>),
  cwd = process.cwd(),
) {
  try {
    console.log(chalk.cyan("\n🤖 Generating your application...\n"))
    console.log(chalk.gray(`Request: ${description}\n`))

    let application: unknown
    const promptText = `Create a complete, production-ready application for: ${description}
CRITICAL REQUIREMENTS:
1. Generate ALL files needed for the application to run
2. Include package.json with ALL dependencies and correct versions
3. Include README.md with setup instructions
4. Include configuration files (.gitignore, etc.)
5. Write clean, well-commented, production-ready code
6. Include error handling and input validation
7. Use modern JavaScript/TypeScript best practices
8. Make sure all imports and paths are correct
9. NO PLACEHOLDERS - everything must be complete and working

Provide:
- A meaningful kebab-case folder name
- All necessary files with complete content
- Setup commands (cd folder, npm install, npm run dev, etc.)
- All dependencies with versions`
    if (typeof modelOrGenerate === "function") {
      const result = await modelOrGenerate(ApplicationSchema, promptText)
      application = result.object
    } else {
      const result = await aiGenerateObject({
        model: modelOrGenerate,
        schema: ApplicationSchema,
        prompt: promptText,
      })
      application = result.object
    }

    const app = application as z.infer<typeof ApplicationSchema>

    console.log(chalk.green(`\n✅ Generated: ${app.folderName}\n`))
    console.log(chalk.gray(`Description: ${app.description}\n`))

    if (app.files.length === 0) {
      throw new Error("No files were generated")
    }

    displayFileTree(app.files, app.folderName)

    console.log(chalk.cyan("\n📝 Creating files...\n"))

    const appDir = await createApplicationFiles(
      cwd,
      app.folderName,
      app.files,
    )

    console.log(chalk.green.bold("\n✨ Application created successfully!\n"))
    console.log(chalk.cyan(`📂 Location: ${chalk.bold(appDir)}\n`))

    if (app.setupCommands.length > 0) {
      console.log(chalk.cyan("📋 Next Steps:\n"))
      console.log(chalk.white("```bash"))
      for (const cmd of app.setupCommands) {
        console.log(chalk.white(cmd))
      }
      console.log(chalk.white("```\n"))
    }

    return {
      folderName: app.folderName,
      appDir,
      files: app.files.map((f: { path: string }) => f.path),
      commands: app.setupCommands,
      success: true,
    }
  } catch (error) {
    console.log(
      chalk.red(`\n❌ Error generating application: ${error instanceof Error ? error.message : String(error)}\n`),
    )
    if (error instanceof Error && error.stack) {
      console.log(chalk.dim(error.stack + "\n"))
    }
    throw error
  }
}
