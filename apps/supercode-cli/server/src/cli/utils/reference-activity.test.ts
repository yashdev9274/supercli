import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { unlinkSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { resolveFileReferences, type FileReferenceEvent } from "src/runtime/workspace/file-search"
import { AnalysisActivity, renderReferenceActivity } from "./reference-activity"
import { renderToolBlock, ToolTranscript } from "./tool-presentation"
import { terminalCells } from "./terminal-text"

describe("file-reference activity", () => {
  let root: string
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "reference-activity-")) })
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

  test("lookup and read surround actual loading and share numbering with model tools", async () => {
    const content = Array.from({ length: 10 }, (_, i) => `Support line ${i}`).join("\n")
    await fs.writeFile(path.join(root, "SUPPORT.md"), content)
    const transcript = new ToolTranscript()
    const events: FileReferenceEvent[] = []
    let output = ""
    const result = await resolveFileReferences("analyse @SUPPORT.md", root, [], (event) => {
      events.push(event)
      output += renderReferenceActivity(transcript, event, 80, true)
    })
    expect(result.content[path.join(root, "SUPPORT.md")]).toBe(content)
    expect(events.map((e) => `${e.phase}:${e.state}`)).toEqual(["lookup:start", "lookup:end", "read:start", "read:end"])
    expect(events[0]!.id).toBe(events[1]!.id)
    expect(events[2]!.id).toBe(events[3]!.id)
    expect(transcript.calls.map((c) => [c.number, c.category, c.status])).toEqual([[1, "FILE LOOKUP", "completed"], [2, "READ", "completed"]])
    expect(output.indexOf("FILE LOOKUP · completed")).toBeLessThan(output.indexOf("READ · running"))
    expect(output).toContain("Loaded into this turn's context")
    expect(output).toContain("… +4 lines [Ctrl+O details]")
    expect(renderToolBlock(transcript.calls[1]!, { expanded: true })).toContain("Support line 9")
    const analysis = new AnalysisActivity(["SUPPORT.md"], (text) => { output += text })
    analysis.start(0)
    analysis.end("completed", 4200)
    output += "RESULT\n"
    expect(output.indexOf("READ · completed")).toBeLessThan(output.indexOf("ANALYSIS · running"))
    expect(output.indexOf("ANALYSIS · completed")).toBeLessThan(output.indexOf("RESULT"))
    expect(transcript.start("run_command", { command: "pwd" }, "model-call").number).toBe(3)
    expect(transcript.settle("cancelled").map((c) => c.id)).toEqual(["model-call"])
    expect(transcript.calls[1]!.status).toBe("completed")
  })

  test("missing, directory and oversized references fail lookup without a read", async () => {
    await fs.mkdir(path.join(root, "directory"))
    await fs.writeFile(path.join(root, "large"), Buffer.alloc(512 * 1024))
    const events: FileReferenceEvent[] = []
    const result = await resolveFileReferences("@missing @directory @large", root, [], (event) => events.push(event))
    expect(result.unresolved).toEqual(["missing", "directory", "large"])
    expect(events).toHaveLength(6)
    expect(events.every((e) => e.phase === "lookup")).toBe(true)
    expect(events.filter((e) => e.state === "end").every((e) => e.result?.success === false)).toBe(true)
    expect(events[3]!.result?.error).toContain("not a file")
    expect(events[5]!.result?.error).toContain("512 KiB")
  })

  test("empty files succeed and equivalent references and drag-drop paths deduplicate", async () => {
    const file = path.join(root, "empty.md")
    await fs.writeFile(file, "")
    const transcript = new ToolTranscript()
    const result = await resolveFileReferences("@empty.md @./empty.md,", root, [file], (event) => {
      renderReferenceActivity(transcript, event)
    })
    expect(result.content).toEqual({ [file]: "" })
    expect(transcript.calls).toHaveLength(2)
    expect(transcript.calls[1]).toMatchObject({ status: "completed", output: "Empty file" })
  })

  test("read failures end the read phase, not a second lookup", async () => {
    const file = path.join(root, "unreadable")
    await fs.writeFile(file, "text")
    const events: FileReferenceEvent[] = []
    const result = await resolveFileReferences("@unreadable", root, [], (event) => {
      events.push(event)
      if (event.phase === "read" && event.state === "start") {
        // Deterministic filesystem race without relying on OS permission behavior.
        unlinkSync(file)
      }
    })
    expect(result.unresolved).toEqual(["unreadable"])
    expect(events[3]).toMatchObject({ phase: "read", state: "end", result: { success: false } })
  })

  test("presentation exceptions never break loading; plain prompts emit nothing", async () => {
    await fs.writeFile(path.join(root, "ok"), "ok")
    const result = await resolveFileReferences("@ok", root, [], () => { throw new Error("renderer") })
    expect(result.content[path.join(root, "ok")]).toBe("ok")
    const events: FileReferenceEvent[] = []
    await resolveFileReferences("hello", root, [], (event) => events.push(event))
    expect(events).toEqual([])
  })
})

describe("analysis activity", () => {
  test("ordinary prompts resume analysis after tools without counting tool wait time", () => {
    const writes: string[] = []
    const activity = new AnalysisActivity([], (text) => writes.push(text))
    activity.start(0)
    activity.nextPhase()
    activity.start(100)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain("request and available context")
    activity.end("completed", 1000)
    activity.nextPhase()
    expect(activity.status(5000)).toBeUndefined()
    activity.start(6000)
    expect(activity.status(6500)).toContain("0.5s")
    activity.end("completed", 7000)
    expect(writes).toHaveLength(4)
  })
  for (const outcome of ["completed", "failed", "cancelled"] as const) {
    test(`${outcome} is emitted once after real start`, () => {
      const writes: string[] = []
      const activity = new AnalysisActivity(["SUPPORT.md"], (text) => writes.push(text))
      expect(activity.status(0)).toBeUndefined()
      activity.end(outcome, 0)
      expect(writes).toEqual([])
      activity.start(0)
      activity.start(100)
      expect(activity.status(4200)).toContain("4.2s")
      activity.end(outcome, 4200)
      activity.end(outcome, 5000)
      activity.start(6000)
      expect(writes).toHaveLength(2)
      expect(writes[1]).toContain(`${outcome} · 4.2s`)
      expect(activity.status(6000)).toBeUndefined()
    })
  }

  test("untrusted paths are sanitized and wrapped", () => {
    let output = ""
    const activity = new AnalysisActivity(["\x1b[2Jvery-long-文件-name.md"], (text) => { output += text }, 24)
    activity.start(0)
    activity.end("completed", 4200)
    expect(output).not.toContain("\x1b")
    for (const line of output.trimEnd().split("\n")) expect(terminalCells(line)).toBeLessThanOrEqual(24)
  })
})
