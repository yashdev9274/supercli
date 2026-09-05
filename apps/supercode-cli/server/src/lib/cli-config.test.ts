import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import * as lockfile from "proper-lockfile"

import { version } from "../../package.json"
import { getCliConfig, saveCliConfig, updateCliConfig } from "./cli-config"

const BASE_CONFIG = {
  version,
  provider: "supercode",
  model: "saved-choice",
  mode: "chat",
} as const

let directory: string
let configFile: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "supercode-config-test-"))
  configFile = path.join(directory, "cli-config.json")
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

async function writeConfig(config: unknown): Promise<void> {
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf-8")
}

describe("CLI config persistence", () => {
  test("preserves unrelated nested config and unknown fields when adding a server", async () => {
    const original = {
      ...BASE_CONFIG,
      mcpServers: {
        parallel: {
          url: "https://private.example.test/mcp",
          headers: { "X-Custom": "keep-me" },
          settings: { timeout: 42 },
        },
      },
      mcpCredentials: { parallel: { apiKey: "test-key" } },
      composioSessionId: "session-123",
      connectorConfigs: { custom: { provider: "custom", enabled: true } },
      futureSetting: { nested: ["keep", "everything"] },
    }
    await writeConfig(original)

    await updateCliConfig((config) => ({
      mcpServers: { ...config.mcpServers, added: { command: "worker" } },
    }), configFile)

    expect(await getCliConfig(configFile)).toEqual({
      ...original,
      mcpServers: { ...original.mcpServers, added: { command: "worker" } },
    })
  })

  test("updates raw older-version config even when the public getter rejects it", async () => {
    const original = {
      ...BASE_CONFIG,
      version: "previous-release",
      mcpServers: { parallel: { url: "https://private.example.test/mcp" } },
      futureSetting: { enabled: true },
    }
    await writeConfig(original)
    expect(await getCliConfig(configFile)).toBeNull()

    await updateCliConfig((config) => ({
      mcpServers: { ...config.mcpServers, added: { command: "worker" } },
    }), configFile)

    expect(await getCliConfig(configFile)).toEqual({
      ...original,
      version,
      mcpServers: { ...original.mcpServers, added: { command: "worker" } },
    })
  })

  test("a no-op preserves the exact file bytes and does not upgrade its version", async () => {
    const original = `{\n\t"version": "previous-release",\n\t"mcpServers": { "parallel": { "url": "https://private.example.test/mcp" } },\n\t"futureSetting": 42\n}\n`
    await fs.writeFile(configFile, original, "utf-8")

    await updateCliConfig((config) => {
      expect(config.mcpServers?.parallel?.url).toBe("https://private.example.test/mcp")
      return null
    }, configFile)

    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect(await getCliConfig(configFile)).toBeNull()
    expect(await fs.readdir(directory)).toEqual(["cli-config.json"])
  })

  test("creates a missing config directory and persists defaults with the update", async () => {
    const nestedFile = path.join(directory, "nested", "cli-config.json")
    expect(await getCliConfig(nestedFile)).toBeNull()

    await updateCliConfig(() => ({ mcpServers: { added: { command: "worker" } } }), nestedFile)

    expect(await getCliConfig(nestedFile)).toMatchObject({
      version,
      provider: "supercode",
      mode: "chat",
      mcpServers: { added: { command: "worker" } },
    })
    expect((await fs.stat(nestedFile)).mode & 0o777).toBe(0o600)
  })

  test("preserves an existing config file's permissions after replacement", async () => {
    await writeConfig(BASE_CONFIG)
    await fs.chmod(configFile, 0o640)

    await updateCliConfig(() => ({ mode: "agent" }), configFile)

    expect((await getCliConfig(configFile))?.mode).toBe("agent")
    expect((await fs.stat(configFile)).mode & 0o777).toBe(0o640)
  })

  test("allows read-only no-ops without bypassing write protection", async () => {
    await writeConfig(BASE_CONFIG)
    const original = await fs.readFile(configFile, "utf-8")
    await fs.chmod(configFile, 0o400)

    await updateCliConfig(() => null, configFile)
    // Root can also write a read-only file through the original writeFile API.
    if (process.geteuid?.() !== 0) {
      await expect(updateCliConfig(() => ({ mode: "agent" }), configFile)).rejects.toThrow()
    }

    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect((await fs.stat(configFile)).mode & 0o777).toBe(0o400)
  })

  test("legacy saves and strict updates preserve an existing config symlink", async () => {
    await writeConfig({ ...BASE_CONFIG, mcpServers: { custom: { command: "keep" } } })
    const aliasFile = path.join(directory, "config-link.json")
    await fs.symlink("cli-config.json", aliasFile)

    await saveCliConfig({ mode: "agent" }, aliasFile)
    expect(await fs.readlink(aliasFile)).toBe("cli-config.json")
    expect((await getCliConfig(configFile))?.mode).toBe("agent")

    await updateCliConfig((config) => ({
      mcpServers: { ...config.mcpServers, added: { command: "worker" } },
    }), aliasFile)

    expect(await fs.readlink(aliasFile)).toBe("cli-config.json")
    expect(await getCliConfig(configFile)).toEqual({
      ...BASE_CONFIG,
      mode: "agent",
      mcpServers: { custom: { command: "keep" }, added: { command: "worker" } },
    })
  })

  test("creates a dangling symlink target without replacing either link", async () => {
    const intermediateFile = path.join(directory, "intermediate-config.json")
    const targetFile = path.join(directory, "target-config.json")
    await fs.symlink("target-config.json", intermediateFile)
    await fs.symlink("intermediate-config.json", configFile)
    expect(await getCliConfig(configFile)).toBeNull()

    await updateCliConfig(() => ({ mcpServers: { added: { command: "worker" } } }), configFile)

    expect(await fs.readlink(configFile)).toBe("intermediate-config.json")
    expect(await fs.readlink(intermediateFile)).toBe("target-config.json")
    expect(await fs.realpath(configFile)).toBe(await fs.realpath(targetFile))
    expect(await getCliConfig(targetFile)).toMatchObject({
      version,
      mcpServers: { added: { command: "worker" } },
    })
  })

  test("resolves a dangling symlink's parent traversal after following directory aliases", async () => {
    const configDirectory = path.join(directory, "config")
    const treeDirectory = path.join(directory, "dotfiles", "tree")
    await fs.mkdir(configDirectory)
    await fs.mkdir(path.join(treeDirectory, "child"), { recursive: true })
    await fs.symlink("../dotfiles/tree/child", path.join(configDirectory, "alias"))

    const siblingFile = path.join(configDirectory, "settings.json")
    const original = JSON.stringify({ ...BASE_CONFIG, mcpServers: { unrelated: { command: "keep" } } })
    await fs.writeFile(siblingFile, original, "utf-8")
    const linkedConfig = path.join(configDirectory, "cli-config.json")
    await fs.symlink("alias/../settings.json", linkedConfig)
    expect(await getCliConfig(linkedConfig)).toBeNull()

    await updateCliConfig(() => ({ mcpServers: { added: { command: "worker" } } }), linkedConfig)

    const targetFile = path.join(treeDirectory, "settings.json")
    expect(await fs.readlink(linkedConfig)).toBe("alias/../settings.json")
    expect(await fs.realpath(linkedConfig)).toBe(await fs.realpath(targetFile))
    expect(await fs.readFile(siblingFile, "utf-8")).toBe(original)
    expect(await getCliConfig(targetFile)).toMatchObject({
      version,
      mcpServers: { added: { command: "worker" } },
    })
  })

  test("rejects malformed config without overwriting it, while legacy saves retain their fallback", async () => {
    const original = "{ \"mcpServers\": "
    await fs.writeFile(configFile, original, "utf-8")

    await expect(updateCliConfig(() => ({ mode: "agent" }), configFile)).rejects.toThrow()
    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect(await getCliConfig(configFile)).toBeNull()

    expect(await saveCliConfig({ mode: "agent" }, configFile)).toMatchObject({ version, mode: "agent" })
    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect(await fs.readdir(directory)).toEqual(["cli-config.json"])
  })

  test("propagates read errors before invoking the updater", async () => {
    await fs.mkdir(configFile)
    let invoked = false

    await expect(updateCliConfig(() => {
      invoked = true
      return { mode: "agent" }
    }, configFile)).rejects.toThrow()

    expect(invoked).toBe(false)
    expect(await fs.readdir(configFile)).toEqual([])
    expect(await fs.readdir(directory)).toEqual(["cli-config.json"])
  })

  test("a failed rename preserves the original file and permits a subsequent update", async () => {
    await writeConfig({ ...BASE_CONFIG, mcpServers: { custom: { command: "keep" } } })
    const original = await fs.readFile(configFile, "utf-8")
    const resolvedConfigFile = await fs.realpath(configFile)
    const rename = fs.rename
    const failure = Object.assign(new Error("config rename denied"), { code: "EACCES" })
    const renameSpy = spyOn(fs, "rename").mockImplementation((source, destination) => {
      return destination === resolvedConfigFile ? Promise.reject(failure) : rename(source, destination)
    })

    try {
      await expect(updateCliConfig(() => ({ mode: "agent" }), configFile)).rejects.toThrow("config rename denied")
      expect(await fs.readFile(configFile, "utf-8")).toBe(original)
      expect(await fs.readdir(directory)).toEqual(["cli-config.json"])
    } finally {
      renameSpy.mockRestore()
    }

    await updateCliConfig(() => ({ mode: "agent" }), configFile)
    expect(await getCliConfig(configFile)).toEqual({
      ...BASE_CONFIG,
      mode: "agent",
      mcpServers: { custom: { command: "keep" } },
    })
  })

  test("a throwing updater leaves config intact and releases its lock", async () => {
    await writeConfig(BASE_CONFIG)
    const original = await fs.readFile(configFile, "utf-8")

    await expect(updateCliConfig(() => {
      throw new Error("cannot apply update")
    }, configFile)).rejects.toThrow("cannot apply update")

    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    await updateCliConfig(() => ({ mode: "agent" }), configFile)
    expect((await getCliConfig(configFile))?.mode).toBe("agent")
  })

  test("a compromised writer cannot overwrite a competing update and can recover", async () => {
    await writeConfig({ ...BASE_CONFIG, mcpServers: { original: { command: "keep" } } })
    const resolvedConfigFile = await fs.realpath(configFile)
    const displacedLock = path.join(directory, "displaced.lock")
    const writePaused = Promise.withResolvers<void>()
    const resumeWrite = Promise.withResolvers<void>()
    const compromised = Promise.withResolvers<Error>()
    const lock = lockfile.lock
    const lockSpy = spyOn(lockfile, "lock").mockImplementation((file, options) => lock(file, {
      ...options,
      update: 1000,
      onCompromised: (error) => {
        options?.onCompromised?.(error)
        compromised.resolve(error)
      },
    }))
    const writeFile = fs.writeFile
    let pauseNextWrite = true
    const writeSpy = spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      await writeFile(file, data, options)
      if (pauseNextWrite && typeof file === "string" && file.startsWith(`${resolvedConfigFile}.`) && file.endsWith(".tmp")) {
        pauseNextWrite = false
        writePaused.resolve()
        await resumeWrite.promise
      }
    })
    const firstUpdate = Promise.allSettled([updateCliConfig((config) => ({
      mcpServers: { ...config.mcpServers, stale: { command: "must-not-save" } },
    }), configFile)])

    try {
      await writePaused.promise
      // Displace the actual lock while its writer is waiting on file I/O.
      await fs.rename(`${resolvedConfigFile}.lock`, displacedLock)
      await updateCliConfig((config) => ({
        mcpServers: { ...config.mcpServers, competitor: { command: "newer" } },
      }), configFile)
      const competitorBytes = await fs.readFile(configFile, "utf-8")
      const error = await compromised.promise
      expect(error).toMatchObject({ code: "ECOMPROMISED" })

      resumeWrite.resolve()
      expect(await firstUpdate).toEqual([{ status: "rejected", reason: error }])
      expect(await fs.readFile(configFile, "utf-8")).toBe(competitorBytes)
      expect((await fs.readdir(directory)).sort()).toEqual(["cli-config.json", "displaced.lock"])

      await fs.rmdir(displacedLock)
      await updateCliConfig(() => ({ mode: "agent" }), configFile)
      expect(await getCliConfig(configFile)).toEqual({
        ...BASE_CONFIG,
        mode: "agent",
        mcpServers: { original: { command: "keep" }, competitor: { command: "newer" } },
      })
      expect(await fs.readdir(directory)).toEqual(["cli-config.json"])
    } finally {
      resumeWrite.resolve()
      await firstUpdate
      writeSpy.mockRestore()
      lockSpy.mockRestore()
    }
  }, 10000)

  test("replaces server definitions and deletes names without restoring old nested values", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      mcpServers: {
        changed: { command: "old", args: ["--old"], env: { OLD: "value" } },
        sibling: { command: "keep" },
      },
    })

    await updateCliConfig((config) => ({
      mcpServers: { ...config.mcpServers, changed: { url: "https://new.example.test/mcp" } },
    }), configFile)
    expect((await getCliConfig(configFile))?.mcpServers).toEqual({
      changed: { url: "https://new.example.test/mcp" },
      sibling: { command: "keep" },
    })

    await updateCliConfig((config) => {
      const servers = { ...config.mcpServers }
      delete servers.changed
      return { mcpServers: servers }
    }, configFile)
    expect((await getCliConfig(configFile))?.mcpServers).toEqual({ sibling: { command: "keep" } })
  })

  test("object saves retain intentional map clears and undefined field removal", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      apiKeys: { google: "old-key" },
      mcpServers: { custom: { command: "old" } },
      composioSessionId: "old-session",
      futureSetting: { enabled: true },
    })

    await saveCliConfig({ apiKeys: {}, mcpServers: {}, composioSessionId: undefined }, configFile)

    const expected = {
      ...BASE_CONFIG,
      apiKeys: {},
      mcpServers: {},
      futureSetting: { enabled: true },
    }
    expect(await getCliConfig(configFile)).toEqual(expected)
  })

  test("separate processes preserve mixed updates through a symlink and its target", async () => {
    await writeConfig({
      ...BASE_CONFIG,
      mcpServers: { custom: { url: "https://private.example.test/mcp" } },
      futureSetting: { enabled: true },
    })
    const aliasFile = path.join(directory, "config-link.json")
    await fs.symlink("cli-config.json", aliasFile)
    const patches = [
      { mode: "agent" },
      { crispMode: "lite" },
      { composioSessionId: "concurrent-session" },
      { composioApiKey: "concurrent-key" },
    ]
    const moduleUrl = new URL("./cli-config.ts", import.meta.url).href
    const children = patches.map((patch, index) => Bun.spawn([
      process.execPath,
      "--eval",
      `
        const { updateCliConfig, saveCliConfig } = await import(${JSON.stringify(moduleUrl)})
        const configFile = ${JSON.stringify(index % 2 === 0 ? configFile : aliasFile)}
        const start = new Promise(resolve => process.stdin.once("data", resolve))
        process.stdout.write("ready\\n")
        await start
        process.stdin.pause()
        for (let round = 0; round < 4; round++) {
          const name = "worker-${index}-" + round
          await updateCliConfig(config => ({
            mcpServers: { ...config.mcpServers, [name]: { command: "worker" } },
          }), configFile)
          await saveCliConfig(${JSON.stringify(patch)}, configFile)
        }
      `,
    ], { stdin: "pipe", stdout: "pipe", stderr: "pipe" }))
    const errors = children.map((child) => new Response(child.stderr).text())
    const deadline = setTimeout(() => {
      for (const child of children) {
        if (child.exitCode === null) child.kill()
      }
    }, 10000)

    try {
      // Release independent runtimes together so a module-local queue cannot satisfy this test.
      await Promise.all(children.map(async (child) => {
        const reader = child.stdout.getReader()
        let output = ""
        while (!output.includes("\n")) {
          const chunk = await reader.read()
          if (chunk.done) break
          output += new TextDecoder().decode(chunk.value)
        }
        reader.releaseLock()
        expect(output.trim()).toBe("ready")
      }))
      await Promise.all(children.map(async (child) => {
        await child.stdin.write("start\n")
        await child.stdin.end()
      }))

      await Promise.all(children.map(async (child, index) => {
        const exitCode = await child.exited
        const stderr = await errors[index]
        if (exitCode !== 0) throw new Error(`Config writer exited ${exitCode}: ${stderr}`)
      }))
    } finally {
      clearTimeout(deadline)
      for (const child of children) {
        if (child.exitCode === null) child.kill()
      }
      await Promise.all(children.map((child) => child.exited))
    }

    const config = await getCliConfig(configFile)
    for (const patch of patches) expect(config).toMatchObject(patch)
    expect(config).toMatchObject({
      mcpServers: { custom: { url: "https://private.example.test/mcp" } },
      futureSetting: { enabled: true },
    })
    expect(Object.keys(config?.mcpServers ?? {})).toHaveLength(17)
    for (let index = 0; index < patches.length; index++) {
      for (let round = 0; round < 4; round++) {
        expect(config?.mcpServers?.[`worker-${index}-${round}`]).toEqual({ command: "worker" })
      }
    }
    expect(await fs.readlink(aliasFile)).toBe("cli-config.json")
    expect((await fs.readdir(directory)).sort()).toEqual(["cli-config.json", "config-link.json"])
  }, 15000)
})
