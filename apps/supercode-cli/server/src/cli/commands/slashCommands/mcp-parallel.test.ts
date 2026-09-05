import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import * as prompts from "@clack/prompts"

import * as cliConfig from "src/lib/cli-config"
import { getMcpManager } from "src/mcp/mcp-manager"

import { version } from "../../../../package.json"
import { configureParallelMcp, mcpCommand, PARALLEL_MCP_PRESET, type ParallelPresetDependencies } from "./mcp"

const directories: string[] = []

afterEach(async () => {
  mock.restore()
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function harness(config: Record<string, unknown> = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "supercli-parallel-"))
  directories.push(directory)
  const configFile = path.join(directory, "cli-config.json")
  const original = { version, provider: "supercode", model: "test-model", mode: "chat", ...config }
  await fs.writeFile(configFile, JSON.stringify(original, null, 2) + "\n")
  const reconnect = mock(async (_name: string, _server: cliConfig.McpServerConfig) => {})
  const dependencies: ParallelPresetDependencies = {
    updateConfig: (update) => cliConfig.updateCliConfig(update, configFile),
    reconnect,
  }
  return { configFile, original, reconnect, dependencies }
}

function useConfigFile(configFile: string) {
  const { getCliConfig, updateCliConfig } = cliConfig
  spyOn(cliConfig, "getCliConfig").mockImplementation(() => getCliConfig(configFile))
  spyOn(cliConfig, "updateCliConfig").mockImplementation((update) => updateCliConfig(update, configFile))
}

describe("Parallel MCP preset", () => {
  test("uses the canonical Parallel MCP endpoint", () => {
    expect(PARALLEL_MCP_PRESET).toEqual({
      name: "parallel",
      config: { url: "https://search.parallel.ai/mcp" },
    })
  })

  test("preserves unrelated MCP configuration and the Composio session on disk", async () => {
    const state = await harness({
      theme: "dark",
      composioSessionId: "session-123",
      mcpServers: { custom: { command: "custom", env: { KEEP: "value" } } },
      mcpCredentials: { custom: { authType: "api-key", apiKey: "test-key" } },
      connectorConfigs: { custom: { provider: "custom", enabled: true } },
    })

    expect(await configureParallelMcp(state.dependencies)).toBe("configured")
    expect(JSON.parse(await fs.readFile(state.configFile, "utf-8"))).toEqual({
      ...state.original,
      mcpServers: {
        custom: { command: "custom", env: { KEEP: "value" } },
        parallel: PARALLEL_MCP_PRESET.config,
      },
    })
    expect(state.reconnect).toHaveBeenCalledWith("parallel", PARALLEL_MCP_PRESET.config)
  })

  test("does not create Composio state when it is absent", async () => {
    const state = await harness({ theme: "dark" })

    expect(await configureParallelMcp(state.dependencies)).toBe("configured")
    const saved = JSON.parse(await fs.readFile(state.configFile, "utf-8"))
    expect(saved).not.toHaveProperty("composioSessionId")
    expect(saved).not.toHaveProperty("composioApiKey")
    expect(saved.mcpServers).toEqual({ parallel: PARALLEL_MCP_PRESET.config })
  })

  test("preserves an older-version custom Parallel config byte for byte", async () => {
    const state = await harness({
      version: "older-version",
      theme: "dark",
      mcpServers: {
        custom: { command: "custom" },
        parallel: {
          url: "https://private.example.test/mcp",
          headers: { Authorization: "Bearer test-token", "X-Custom": "keep-me" },
          credentials: { profile: "work" },
          settings: { timeout: 42 },
        },
      },
    })
    const before = await fs.readFile(state.configFile, "utf-8")
    expect(await cliConfig.getCliConfig(state.configFile)).toBeNull()

    expect(await configureParallelMcp(state.dependencies)).toBe("already-configured")
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(before)
    expect(state.reconnect).not.toHaveBeenCalled()
  })

  test.each([
    { headers: { Authorization: "Bearer test-token" } },
    { settings: { timeout: 42 } },
    { command: "custom" },
  ])("does not reconnect a customized canonical endpoint: %j", async (customization) => {
    const state = await harness({
      mcpServers: { parallel: { ...PARALLEL_MCP_PRESET.config, ...customization } },
    })
    const before = await fs.readFile(state.configFile, "utf-8")

    expect(await configureParallelMcp(state.dependencies)).toBe("already-configured")
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(before)
    expect(state.reconnect).not.toHaveBeenCalled()
  })

  test("does not reconnect an existing preset with separately stored credentials", async () => {
    const state = await harness({
      mcpServers: { parallel: PARALLEL_MCP_PRESET.config },
      mcpCredentials: { parallel: { authType: "api-key", apiKey: "test-key" } },
    })
    const before = await fs.readFile(state.configFile, "utf-8")

    expect(await configureParallelMcp(state.dependencies)).toBe("already-configured")
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(before)
    expect(state.reconnect).not.toHaveBeenCalled()
  })

  test("reports a deferred connection and recovers on repeated invocation without rewriting", async () => {
    const state = await harness()
    state.reconnect.mockRejectedValueOnce(new Error("offline"))

    expect(await configureParallelMcp(state.dependencies)).toBe("connection-deferred")
    const saved = await fs.readFile(state.configFile, "utf-8")
    const inode = (await fs.stat(state.configFile)).ino
    expect(JSON.parse(saved).mcpServers.parallel).toEqual(PARALLEL_MCP_PRESET.config)

    expect(await configureParallelMcp(state.dependencies)).toBe("configured")
    expect(state.reconnect).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(saved)
    expect((await fs.stat(state.configFile)).ino).toBe(inode)
  })

  test("does not install a preset over existing credentials without a server entry", async () => {
    const state = await harness({
      mcpCredentials: { parallel: { authType: "api-key", apiKey: "test-key" } },
    })
    const before = await fs.readFile(state.configFile, "utf-8")

    expect(await configureParallelMcp(state.dependencies)).toBe("already-configured")
    expect(await configureParallelMcp(state.dependencies)).toBe("already-configured")
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(before)
    expect(state.reconnect).not.toHaveBeenCalled()
  })

  test("a failed write prevents reconnect and can be retried", async () => {
    const state = await harness({ mcpServers: { custom: { command: "custom" } } })
    const before = await fs.readFile(state.configFile, "utf-8")
    const targetFile = await fs.realpath(state.configFile)
    const rename = fs.rename
    const failure = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === targetFile) throw new Error("disk full")
      await rename(from, to)
    })

    await expect(configureParallelMcp(state.dependencies)).rejects.toThrow("disk full")
    expect(state.reconnect).not.toHaveBeenCalled()
    expect(await fs.readFile(state.configFile, "utf-8")).toBe(before)

    failure.mockRestore()
    expect(await configureParallelMcp(state.dependencies)).toBe("configured")
    expect(state.reconnect).toHaveBeenCalledTimes(1)
  })

  test("does not restart an already connected preset", async () => {
    const state = await harness({ mcpServers: { parallel: PARALLEL_MCP_PRESET.config } })
    const manager = getMcpManager()
    Object.defineProperty(manager, "connectedServers", { value: ["parallel"], configurable: true })
    const reconnect = spyOn(manager, "reconnectServer").mockResolvedValue(undefined)
    try {
      expect(await configureParallelMcp({ updateConfig: state.dependencies.updateConfig })).toBe("configured")
      expect(reconnect).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(manager, "connectedServers")
    }
  })

  test("the slash command distinguishes a saved config from a failed connection and offers retry", async () => {
    const state = await harness()
    useConfigFile(state.configFile)
    const reconnect = spyOn(getMcpManager(), "reconnectServer")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined)
    const output = spyOn(process.stdout, "write").mockReturnValue(true)

    await mcpCommand("parallel")
    expect(output.mock.calls.flat().join("")).toContain("configuration saved; connection deferred")
    expect(output.mock.calls.flat().join("")).toContain("Run /mcp parallel to retry")

    output.mockClear()
    await mcpCommand("parallel")
    expect(output.mock.calls.flat().join("")).toContain("parallel configured and connected")
    expect(reconnect).toHaveBeenCalledTimes(2)
  })

  test("the slash command does not claim success when persistence fails", async () => {
    const state = await harness()
    useConfigFile(state.configFile)
    const targetFile = await fs.realpath(state.configFile)
    const rename = fs.rename
    spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (to === targetFile) throw new Error("disk full")
      await rename(from, to)
    })
    const reconnect = spyOn(getMcpManager(), "reconnectServer").mockResolvedValue(undefined)
    const output = spyOn(process.stdout, "write").mockReturnValue(true)

    await mcpCommand("parallel")
    expect(output.mock.calls.flat().join("")).toContain("could not be saved; connection was not attempted")
    expect(output.mock.calls.flat().join("")).not.toContain("configured and connected")
    expect(reconnect).not.toHaveBeenCalled()
  })

  test("removing a server preserves one added while the picker was open", async () => {
    const state = await harness({ mcpServers: { custom: { command: "custom" } } })
    useConfigFile(state.configFile)
    spyOn(prompts, "select").mockImplementationOnce(async (options) => {
      await cliConfig.updateCliConfig((config) => ({
        mcpServers: { ...config.mcpServers, parallel: PARALLEL_MCP_PRESET.config },
      }))
      return options.options[0]!.value
    })
    const stop = spyOn(getMcpManager(), "stopServer").mockResolvedValue(true)
    spyOn(process.stdout, "write").mockReturnValue(true)

    await mcpCommand("remove")
    expect(JSON.parse(await fs.readFile(state.configFile, "utf-8")).mcpServers).toEqual({
      parallel: PARALLEL_MCP_PRESET.config,
    })
    expect(stop).toHaveBeenCalledWith("custom")
  })
})
