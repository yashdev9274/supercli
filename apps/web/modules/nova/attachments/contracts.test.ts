import { expect, test } from "bun:test"

import {
  classifyLocalFile,
  formatLocalAttachmentsContext,
  imageDataUrl,
  localAttachmentsFromMetadata,
  localAttachmentsSchema,
  sanitizeFileName,
  toLocalAttachmentMeta,
} from "./contracts"

test("localAttachmentsSchema accepts text, image, and document kinds", () => {
  const ok = localAttachmentsSchema.safeParse([
    {
      id: "a1",
      kind: "text",
      name: "notes.ts",
      mediaType: "text/plain",
      size: 12,
      text: "export const x = 1",
    },
    {
      id: "a2",
      kind: "image",
      name: "shot.png",
      mediaType: "image/png",
      size: 8,
      dataBase64: "iVBORw0KGgo=",
    },
    {
      id: "a3",
      kind: "document",
      name: "brief.pdf",
      mediaType: "application/pdf",
      size: 20,
      text: "Quarterly plan",
    },
  ])
  expect(ok.success).toBe(true)

  const tooMany = localAttachmentsSchema.safeParse(
    Array.from({ length: 9 }, (_, i) => ({
      id: `id_${i}`,
      kind: "text",
      name: `f${i}.ts`,
      mediaType: "text/plain",
      size: 1,
      text: "a",
    })),
  )
  expect(tooMany.success).toBe(false)
})

test("classifyLocalFile recognizes photos and office docs", () => {
  expect(classifyLocalFile("shot.PNG", "image/png")).toBe("image")
  expect(classifyLocalFile("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("document")
  expect(classifyLocalFile("sheet.xlsx")).toBe("document")
  expect(classifyLocalFile("app.ts")).toBe("text")
  expect(classifyLocalFile("binary.exe")).toBe(null)
})

test("formatLocalAttachmentsContext wraps docs and notes images", () => {
  const context = formatLocalAttachmentsContext([
    {
      id: "file1",
      kind: "text",
      name: "auth.ts",
      mediaType: "text/typescript",
      size: 24,
      text: "export function login() {}",
    },
    {
      id: "img1",
      kind: "image",
      name: "ui.png",
      mediaType: "image/png",
      size: 12,
      dataBase64: "abc",
    },
  ])
  expect(context).toContain("<nova_local_files>")
  expect(context).toContain("export function login() {}")
  expect(context).toContain("untrusted user-provided")
  expect(context).toContain("cannot write back")
  expect(context).toContain("ui.png")
  expect(context).toContain("vision inputs")
})

test("imageDataUrl builds a data URL", () => {
  expect(imageDataUrl({
    id: "1",
    kind: "image",
    name: "a.png",
    mediaType: "image/png",
    size: 3,
    dataBase64: "abc",
  })).toBe("data:image/png;base64,abc")
  expect(imageDataUrl({
    id: "2",
    kind: "text",
    name: "a.ts",
    mediaType: "text/plain",
    size: 1,
    text: "x",
  })).toBe(null)
})

test("metadata helpers strip body text and base64", () => {
  const meta = toLocalAttachmentMeta({
    id: "x",
    kind: "document",
    name: "readme.pdf",
    mediaType: "application/pdf",
    size: 4,
    text: "# hi",
    dataBase64: "qq",
  })
  expect(meta).toEqual({
    id: "x",
    kind: "document",
    name: "readme.pdf",
    mediaType: "application/pdf",
    size: 4,
  })
  expect(localAttachmentsFromMetadata({ localAttachments: [meta] })).toEqual([meta])
  expect(localAttachmentsFromMetadata({})).toEqual([])
})

test("sanitizeFileName keeps a safe basename", () => {
  expect(sanitizeFileName("../../etc/passwd")).toBe("passwd")
  expect(sanitizeFileName("my file (1).ts")).toBe("my file (1).ts")
})
