import { describe, expect, test } from "bun:test"
import { createHash, generateKeyPairSync, verify } from "node:crypto"
import { CuaExecutor } from "./executor"
import { brokerRequest } from "./broker"

describe("desktop command executor", () => {
  test("signs proofs and executes once after a fenced start", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519")
    const calls: string[] = []
    const fence = "a".repeat(43)
    const request = async (endpoint: "poll" | "claim" | "start" | "complete", input: object) => {
      const p = input as Record<string, any>
      const message = endpoint === "poll" ? ["nova-desktop-poll-v1", p.deviceId, p.timestamp, p.nonce] : ["nova-desktop-request-v1", p.deviceId, p.operation, p.commandId, p.fence, p.result, p.timestamp, p.nonce]
      expect(verify(null, Buffer.from(JSON.stringify(message)), publicKey, Buffer.from(p.signature, "base64url"))).toBe(true)
      calls.push(endpoint)
      if (endpoint === "poll") return { commands: [{ id: "one" }] }
      if (endpoint === "claim") return { fence, command: { id: "one", toolName: "list_apps", capability: "nova-harness:list_apps", arguments: {}, argsHash: createHash("sha256").update("{}").digest("hex"), expiresAt: new Date(Date.now() + 10_000).toISOString() } }
      return { ok: true }
    }
    const executor = new CuaExecutor("device", privateKey, request, { async call() { calls.push("execute"); return { items: [] } } })
    await executor.poll()
    await executor.poll()
    expect(calls).toEqual(["poll", "claim", "start", "execute", "complete", "poll"])
  })

  test("does not execute after an uncertain start and never retries the command", async () => {
    const { privateKey } = generateKeyPairSync("ed25519")
    let executions = 0
    let claims = 0
    const executor = new CuaExecutor("device", privateKey, async endpoint => {
      if (endpoint === "poll") return { commands: [{ id: "one" }] }
      if (endpoint === "claim") { claims++; return { fence: "a".repeat(43), command: { id: "one", toolName: "list_apps", capability: "nova-harness:list_apps", arguments: {}, argsHash: createHash("sha256").update("{}").digest("hex"), expiresAt: new Date(Date.now() + 10_000).toISOString() } } }
      throw new Error("lost response")
    }, { async call() { executions++; return {} } })
    await expect(executor.poll()).rejects.toThrow()
    await executor.poll()
    expect(claims).toBe(1)
    expect(executions).toBe(0)
  })

  test("requires a clean HTTPS origin", () => {
    for (const url of ["http://localhost", "https://user:pass@example.com", "https://example.com/path"]) expect(() => brokerRequest(url)).toThrow()
    expect(() => brokerRequest("https://example.com")).not.toThrow()
  })
})
