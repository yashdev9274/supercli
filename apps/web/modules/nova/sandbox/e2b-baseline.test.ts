import { expect, spyOn, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { E2BWorkspace } from "./e2b"
import { checkoutE2B } from "./e2b-checkout"

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
