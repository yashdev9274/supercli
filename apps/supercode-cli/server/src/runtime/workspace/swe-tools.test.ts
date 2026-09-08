import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileTool } from "../../agents/tools/read_file"
import { editFileTool } from "../../agents/tools/edit_file"
import { writeFileTool } from "../../agents/tools/write_file"
import { searchFilesTool } from "../../agents/tools/search_files"
import { resolvePath } from "./workspace"

let dir: string
let previous: string | undefined
const parse = (value: unknown) => JSON.parse(String(value))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "supercode-tools-test-"))
  await mkdir(join(dir, "workspace"))
  previous = process.env.SUPERCODE_WORKSPACE_ROOT
  process.env.SUPERCODE_WORKSPACE_ROOT = join(dir, "workspace")
})
afterEach(async () => {
  if (previous === undefined) delete process.env.SUPERCODE_WORKSPACE_ROOT
  else process.env.SUPERCODE_WORKSPACE_ROOT = previous
  await rm(dir, { recursive: true, force: true })
})
const file = (name: string) => join(dir, "workspace", name)

test("bounded reads provide continuation and version; long lines fail explicitly", async () => {
  await writeFile(file("a.txt"), "one\ntwo\nthree")
  const first = parse(await readFileTool.execute({ path: "a.txt", maxLines: 2 }))
  expect(first.data.content).toBe("one\ntwo")
  expect(first.data.nextLine).toBe(3)
  const next = parse(await readFileTool.execute({ path: "a.txt", startLine: 3 }))
  expect(next.data.content).toBe("three")
  expect(next.data.version).toBe(first.data.version)
  await writeFile(file("long.txt"), "x".repeat(60001))
  expect(parse(await readFileTool.execute({ path: "long.txt" })).success).toBe(false)
})

test("rejects sibling-prefix and symlink escapes including new descendants", async () => {
  await mkdir(join(dir, "workspace-other"))
  expect(() => resolvePath("../workspace-other/a")).toThrow("outside")
  await symlink(join(dir, "workspace-other"), file("link"))
  expect(() => resolvePath("link/new/a")).toThrow("outside")
})

test("writes distinguish create/update and stale edits do not overwrite", async () => {
  expect(parse(await writeFileTool.execute({ path: "a.txt", content: "one" })).data.created).toBe(true)
  const first = parse(await readFileTool.execute({ path: "a.txt" }))
  expect(parse(await writeFileTool.execute({ path: "a.txt", content: "two" })).data.created).toBe(false)
  const stale = parse(await editFileTool.execute({ path: "a.txt", oldText: "two", newText: "three", expectedVersion: first.data.version }))
  expect(stale.success).toBe(false)
  expect(await readFile(file("a.txt"), "utf8")).toBe("two")
})

test("ambiguous edits fail and concurrent versioned updates have one winner", async () => {
  await writeFile(file("a.txt"), "same same")
  expect(parse(await editFileTool.execute({ path: "a.txt", oldText: "same", newText: "new" })).success).toBe(false)
  const { data } = parse(await readFileTool.execute({ path: "a.txt" }))
  const results = await Promise.all(["first", "second"].map((content) => writeFileTool.execute({ path: "a.txt", content, expectedVersion: data.version })))
  expect(results.map(parse).filter((r) => r.success)).toHaveLength(1)
})

test("binary files fail reads; search preserves colons and handles shell syntax literally", async () => {
  await writeFile(file("binary"), Buffer.from([0, 1, 2]))
  expect(parse(await readFileTool.execute({ path: "binary" })).success).toBe(false)
  await writeFile(file("quotes':file.ts"), "prefix:a:b:c\n$(touch should-not-exist)\n")
  const found = parse(await searchFilesTool.execute({ pattern: "prefix", literal: true }))
  expect(found.success).toBe(true)
  expect(found.data.matches[0]).toEqual({ file: "quotes':file.ts", line: 1, content: "prefix:a:b:c" })
  const literal = parse(await searchFilesTool.execute({ pattern: "$(touch should-not-exist)", literal: true }))
  expect(literal.data.total).toBe(1)
  expect(await Bun.file(file("should-not-exist")).exists()).toBe(false)
  expect(parse(await searchFilesTool.execute({ pattern: "[" })).success).toBe(false)
})
