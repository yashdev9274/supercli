import { expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { E2BWorkspace } from "./e2b"
import { checkoutE2B } from "./e2b-checkout"
import { MAX_OUTPUT_BYTES } from "./policy"

test("archive checkout creates a clean baseline with Git templates disabled", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nova-baseline-"))
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1])))
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }
  const workspace = {
    sandbox: { files: { write: async () => {} } },
    runBounded: async (command: string, args: string[]) => {
      if (command === "/usr/bin/python3") {
        await writeFile(join(directory, "README"), "archive contents\n")
        return { successful: true }
      }
      const child = Bun.spawn([command, ...args], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
      const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()])
      expect(stderr).not.toContain("not a valid attribute name")
      return { successful: exitCode === 0 }
    },
  } as unknown as E2BWorkspace
  try {
    await checkoutE2B(workspace, "owner/repo", "fixture", new AbortController().signal)
    expect(await readFile(join(directory, ".git/info/attributes"), "utf8")).toBe("* -filter -text -ident\n")
    const status = Bun.spawn(["git", "status", "--porcelain"], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
    expect(await new Response(status.stdout).text()).toBe("")
    expect(await status.exited).toBe(0)
    const head = Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
    expect((await new Response(head.stdout).text()).trim()).toMatch(/^[a-f0-9]{40}$/)
    expect(await head.exited).toBe(0)
  } finally {
    fetchSpy.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})

test("large archive baselines stay within bounded command output", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nova-large-baseline-"))
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1])))
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }
  let outputBytes = 0
  const workspace = {
    sandbox: { files: { write: async () => {} } },
    runBounded: async (command: string, args: string[]) => {
      if (command === "/usr/bin/python3") {
        await Promise.all(Array.from({ length: 600 }, (_, index) => writeFile(join(directory, `repository-file-${index.toString().padStart(4, "0")}-with-a-realistic-long-name.txt`), "archive contents\n")))
        return { successful: true }
      }
      const child = Bun.spawn([command, ...args], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
      const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      outputBytes = Buffer.byteLength(stdout) + Buffer.byteLength(stderr)
      return { successful: exitCode === 0 && outputBytes <= MAX_OUTPUT_BYTES }
    },
  } as unknown as E2BWorkspace
  try {
    await checkoutE2B(workspace, "owner/repo", "fixture", new AbortController().signal)
    expect(outputBytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES)
    const status = Bun.spawn(["git", "status", "--porcelain"], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
    expect(await new Response(status.stdout).text()).toBe("")
    expect(await status.exited).toBe(0)
    const count = Bun.spawn(["git", "ls-files"], { cwd: directory, env, stdout: "pipe", stderr: "pipe" })
    expect((await new Response(count.stdout).text()).trim().split("\n")).toHaveLength(600)
    expect(await count.exited).toBe(0)
  } finally {
    fetchSpy.mockRestore()
    await rm(directory, { recursive: true, force: true })
  }
})
