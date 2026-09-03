import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = path.dirname(import.meta.path)
const entrypoint = path.join(root, "src", "cli", "main.ts")
const dist = path.join(root, "dist")

const binaryTargets = [
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-darwin-x64",
  "bun-darwin-arm64",
] as const

type BinaryTarget = (typeof binaryTargets)[number]

function argumentValues(name: string): string[] {
  const values: string[] = []
  for (let i = 0; i < Bun.argv.length; i += 1) {
    const argument = Bun.argv[i]
    if (argument === name && Bun.argv[i + 1]) values.push(Bun.argv[i + 1])
    if (argument?.startsWith(`${name}=`)) values.push(argument.slice(name.length + 1))
  }
  return values
}

async function buildNpmCli(): Promise<void> {
  const output = path.join(dist, "main.js")
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: dist,
    target: "node",
    packages: "bundle",
    external: ["@modelcontextprotocol/sdk"],
    naming: "main.js",
  })

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join("\n"))
  }

  const contents = await readFile(output, "utf8")
  await writeFile(output, contents.replace(/^#!\/usr\/bin\/env bun/, "#!/usr/bin/env node"))
  console.log(`Built ${path.relative(root, output)}`)
}

async function buildBinary(target: BinaryTarget): Promise<void> {
  const [, platform, architecture] = target.split("-")
  const output = path.join(dist, `supercode-${platform}-${architecture}`)

  const result = await Bun.build({
    entrypoints: [entrypoint],
    compile: { target, outfile: output },
    minify: true,
  })

  if (!result.success) {
    throw new Error(`${target}\n${result.logs.map((log) => log.message).join("\n")}`)
  }

  console.log(`Built ${path.relative(root, output)}`)
}

await mkdir(dist, { recursive: true })

if (Bun.argv.includes("--npm")) {
  await buildNpmCli()
} else {
  const requested = argumentValues("--target")
  const targets = requested.length > 0 ? requested : binaryTargets
  for (const target of targets) {
    if (!binaryTargets.includes(target as BinaryTarget)) {
      throw new Error(`Unsupported binary target: ${target}`)
    }
    await buildBinary(target as BinaryTarget)
  }
}
