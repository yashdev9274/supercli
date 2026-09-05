import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import * as cliConfig from "src/lib/cli-config"
import { getMcpManager } from "src/mcp/mcp-manager"

import { version } from "../../../package.json"
import { mcpServer } from "./mcp-server"

let directory: string
let configFile: string
let previousExitCode: typeof process.exitCode

beforeEach(async () => {
  // Bun does not clear exitCode when assigned undefined.
  previousExitCode = process.exitCode ?? 0
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "supercli-mcp-command-"))
  configFile = path.join(directory, "cli-config.json")
  const update = cliConfig.updateCliConfig
  spyOn(cliConfig, "updateCliConfig").mockImplementation((change) => update(change, configFile))
})

afterEach(async () => {
  process.exitCode = previousExitCode
  mock.restore()
  await fs.rm(directory, { recursive: true, force: true })
})

const actions: ("add" | "remove")[] = ["add", "remove"]

function commandArgs(action: typeof actions[number]): string[] {
  return action === "add"
    ? ["add", "example", "--url", "https://example.test/mcp"]
    : ["remove", "example"]
}

describe("MCP command persistence errors", () => {
  test.each(actions)("%s reports malformed config without rejecting or changing runtime state", async (action) => {
    const original = "{ invalid config"
    await fs.writeFile(configFile, original)
    const reconnect = spyOn(getMcpManager(), "reconnectServer").mockResolvedValue(undefined)
    const stop = spyOn(getMcpManager(), "stopServer").mockResolvedValue(true)
    const output = spyOn(console, "log").mockImplementation(() => {})

    await mcpServer.parseAsync(commandArgs(action), { from: "user" })

    expect(output.mock.calls.flat().join("\n")).toContain("MCP command failed:")
    expect(process.exitCode).toBe(1)
    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect(reconnect).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
  })

  test.each(actions)("%s handles a failed write and succeeds when retried", async (action) => {
    const initialServers = action === "remove"
      ? { keep: { command: "keep" }, example: { url: "https://example.test/mcp" } }
      : { keep: { command: "keep" } }
    await fs.writeFile(configFile, JSON.stringify({ version, mcpServers: initialServers }))
    const original = await fs.readFile(configFile, "utf-8")
    const destination = await fs.realpath(configFile)
    const rename = fs.rename
    const failure = spyOn(fs, "rename").mockImplementation(async (source, target) => {
      if (target === destination) throw new Error("config write denied")
      await rename(source, target)
    })
    const reconnect = spyOn(getMcpManager(), "reconnectServer").mockResolvedValue(undefined)
    const stop = spyOn(getMcpManager(), "stopServer").mockResolvedValue(true)
    spyOn(getMcpManager(), "getTools").mockResolvedValue({})
    spyOn(process.stdout, "write").mockReturnValue(true)
    const output = spyOn(console, "log").mockImplementation(() => {})

    await mcpServer.parseAsync(commandArgs(action), { from: "user" })

    const message = output.mock.calls.flat().join("\n")
    expect(message).toContain("MCP command failed:")
    expect(message).toContain("config write denied")
    expect(process.exitCode).toBe(1)
    expect(message).not.toContain("added and connected")
    expect(message).not.toContain('"example" removed')
    expect(await fs.readFile(configFile, "utf-8")).toBe(original)
    expect(reconnect).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()

    failure.mockRestore()
    output.mockClear()
    // A retry represents a new standalone CLI invocation.
    process.exitCode = previousExitCode
    await mcpServer.parseAsync(commandArgs(action), { from: "user" })

    const saved = JSON.parse(await fs.readFile(configFile, "utf-8"))
    expect(saved.mcpServers.keep).toEqual({ command: "keep" })
    expect(output.mock.calls.flat().join("\n")).not.toContain("MCP command failed:")
    expect(process.exitCode).toBe(previousExitCode)
    if (action === "add") {
      expect(saved.mcpServers.example).toEqual({ url: "https://example.test/mcp" })
      expect(reconnect).toHaveBeenCalledWith("example", { url: "https://example.test/mcp" })
    } else {
      expect(saved.mcpServers).not.toHaveProperty("example")
      expect(stop).toHaveBeenCalledWith("example")
    }
  })
})
