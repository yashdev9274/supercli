import {
  classifyLocalFile,
  extensionOf,
  isLikelyTextFile,
  MAX_LOCAL_ATTACHMENTS,
  MAX_LOCAL_EXTRACTED_CHARS,
  MAX_LOCAL_FILE_BYTES,
  MAX_LOCAL_TOTAL_BYTES,
  sanitizeFileName,
  type LocalAttachment,
} from "@/modules/nova/attachments/contracts"

export type LocalFileReadResult =
  | { ok: true; attachment: LocalAttachment }
  | { ok: false; name: string; error: string }

function looksBinary(text: string): boolean {
  if (text.includes("\0")) return true
  let suspicious = 0
  const sample = text.slice(0, 4_000)
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i)
    if (code < 9 || (code > 13 && code < 32)) suspicious += 1
  }
  return suspicious > sample.length * 0.05
}

function newId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 24)
}

function mediaTypeFor(file: File, fallback: string): string {
  return file.type || fallback
}

async function readAsBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("deflate unsupported")
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

/**
 * Minimal ZIP reader for Office Open XML (docx/xlsx) — stored + deflate only.
 */
async function zipRead(buf: ArrayBuffer, path: string): Promise<Uint8Array | null> {
  const bytes = new Uint8Array(buf)
  const view = new DataView(buf)
  let offset = 0
  while (offset + 30 < bytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 8, true)
    const compSize = view.getUint32(offset + 18, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen))
    const dataStart = nameStart + nameLen + extraLen
    const data = bytes.subarray(dataStart, dataStart + compSize)
    if (name === path) {
      if (method === 0) return data
      if (method === 8) return inflateRaw(data)
      return null
    }
    offset = dataStart + compSize
  }
  return null
}

function stripXml(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

async function extractDocxText(file: File): Promise<string | null> {
  try {
    const xmlBytes = await zipRead(await file.arrayBuffer(), "word/document.xml")
    if (!xmlBytes) return null
    return stripXml(new TextDecoder("utf-8", { fatal: false }).decode(xmlBytes)).slice(0, MAX_LOCAL_EXTRACTED_CHARS)
  } catch {
    return null
  }
}

async function extractXlsxText(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer()
    const shared = await zipRead(buf, "xl/sharedStrings.xml")
    const sheet = await zipRead(buf, "xl/worksheets/sheet1.xml")
    const parts: string[] = []
    if (shared) {
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(shared)
      const matches = xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)
      for (const match of matches) {
        if (match[1]) parts.push(match[1])
      }
    }
    if (sheet) {
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(sheet)
      const inline = xml.matchAll(/<v>([^<]*)<\/v>/g)
      for (const match of inline) {
        if (match[1] && !/^\d+$/.test(match[1])) parts.push(match[1])
      }
    }
    const text = parts.join("\n").trim()
    return text ? text.slice(0, MAX_LOCAL_EXTRACTED_CHARS) : null
  } catch {
    return null
  }
}

/** Best-effort PDF text pull from literal strings (works for many simple PDFs). */
async function extractPdfText(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer()
    const raw = new TextDecoder("latin1").decode(new Uint8Array(buf))
    const chunks: string[] = []
    const paren = /\((?:\\.|[^\\)])*\)/g
    let match: RegExpExecArray | null
    while ((match = paren.exec(raw))) {
      const inner = match[0].slice(1, -1)
      const decoded = inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\")
        .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      if (/[\x20-\x7E\n\r\t]{3,}/.test(decoded) && /[A-Za-z]/.test(decoded)) {
        chunks.push(decoded)
      }
      if (chunks.join("").length > MAX_LOCAL_EXTRACTED_CHARS) break
    }
    const text = chunks.join(" ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    return text ? text.slice(0, MAX_LOCAL_EXTRACTED_CHARS) : null
  } catch {
    return null
  }
}

export async function readLocalFile(file: File): Promise<LocalFileReadResult> {
  const name = sanitizeFileName(file.name || "paste.png")
  const kind = classifyLocalFile(name, file.type)
  if (!kind) {
    return {
      ok: false,
      name,
      error: "Unsupported type — use text, images, PDF, Word, or Excel",
    }
  }
  if (file.size <= 0) {
    return { ok: false, name, error: "Empty files cannot be attached" }
  }
  if (file.size > MAX_LOCAL_FILE_BYTES) {
    return {
      ok: false,
      name,
      error: `File is larger than ${Math.round(MAX_LOCAL_FILE_BYTES / 1024 / 1024)}MB`,
    }
  }

  if (kind === "text") {
    if (!isLikelyTextFile(name, file.type)) {
      return { ok: false, name, error: "Not a text file" }
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      return { ok: false, name, error: "Could not read this file" }
    }
    if (looksBinary(text)) {
      return { ok: false, name, error: "Binary files cannot be attached as text" }
    }
    return {
      ok: true,
      attachment: {
        id: newId(),
        kind: "text",
        name,
        mediaType: mediaTypeFor(file, "text/plain"),
        size: Math.min(file.size, text.length),
        text: text.slice(0, MAX_LOCAL_EXTRACTED_CHARS),
      },
    }
  }

  if (kind === "image") {
    try {
      const dataBase64 = await readAsBase64(file)
      return {
        ok: true,
        attachment: {
          id: newId(),
          kind: "image",
          name,
          mediaType: mediaTypeFor(file, "image/png"),
          size: file.size,
          dataBase64,
        },
      }
    } catch {
      return { ok: false, name, error: "Could not read this image" }
    }
  }

  // document
  const ext = extensionOf(name)
  let text: string | null = null
  if (ext === "docx") text = await extractDocxText(file)
  else if (ext === "xlsx") text = await extractXlsxText(file)
  else if (ext === "pdf") text = await extractPdfText(file)
  else if (ext === "csv" || ext === "tsv" || ext === "rtf") {
    try {
      const raw = await file.text()
      if (!looksBinary(raw)) text = raw.slice(0, MAX_LOCAL_EXTRACTED_CHARS)
    } catch {
      text = null
    }
  }

  let dataBase64: string | undefined
  // Keep binary for docs without solid text extraction so the agent still knows they exist.
  if (!text || text.length < 40) {
    try {
      dataBase64 = await readAsBase64(file)
    } catch {
      dataBase64 = undefined
    }
  }

  if (!text && !dataBase64) {
    return { ok: false, name, error: "Could not read this document" }
  }

  return {
    ok: true,
    attachment: {
      id: newId(),
      kind: "document",
      name,
      mediaType: mediaTypeFor(file, "application/octet-stream"),
      size: file.size,
      text: text || undefined,
      dataBase64,
    },
  }
}

export function mergeLocalAttachments(
  current: LocalAttachment[],
  incoming: LocalAttachment[],
): { attachments: LocalAttachment[]; skipped: string[] } {
  const attachments = [...current]
  const skipped: string[] = []
  let total = attachments.reduce((sum, item) => sum + item.size, 0)

  for (const file of incoming) {
    const duplicate = attachments.some((item) =>
      item.name === file.name
      && item.size === file.size
      && item.kind === file.kind
      && item.text === file.text
      && item.dataBase64 === file.dataBase64,
    )
    if (duplicate) {
      skipped.push(`${file.name} (already attached)`)
      continue
    }
    if (attachments.length >= MAX_LOCAL_ATTACHMENTS) {
      skipped.push(`${file.name} (limit ${MAX_LOCAL_ATTACHMENTS})`)
      continue
    }
    if (total + file.size > MAX_LOCAL_TOTAL_BYTES) {
      skipped.push(`${file.name} (total size limit)`)
      continue
    }
    attachments.push(file)
    total += file.size
  }

  return { attachments, skipped }
}

const ACCEPT =
  ".ts,.tsx,.js,.jsx,.json,.md,.txt,.py,.go,.rs,.swift,.css,.html,.yml,.yaml,.toml,.sh,.sql,.csv," +
  ".png,.jpg,.jpeg,.gif,.webp,.bmp,.heic,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf," +
  "image/*,text/*,application/pdf," +
  "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export async function pickLocalFiles(): Promise<File[]> {
  const anyWindow = window as Window & {
    showOpenFilePicker?: (options?: {
      multiple?: boolean
      excludeAcceptAllOption?: boolean
      types?: Array<{ description?: string; accept: Record<string, string[]> }>
    }) => Promise<Array<{ getFile: () => Promise<File> }>>
  }

  if (typeof anyWindow.showOpenFilePicker === "function") {
    try {
      const handles = await anyWindow.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: false,
        types: [
          {
            description: "Files, photos, and documents",
            accept: {
              "text/*": [".txt", ".md", ".csv", ".json", ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".html", ".yml", ".yaml"],
              "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".heic"],
              "application/pdf": [".pdf"],
              "application/msword": [".doc"],
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              "application/vnd.ms-excel": [".xls"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              "application/vnd.ms-powerpoint": [".ppt"],
              "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
              "application/json": [".json"],
            },
          },
        ],
      })
      const files = await Promise.all(handles.map((handle) => handle.getFile()))
      return files.slice(0, MAX_LOCAL_ATTACHMENTS)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return []
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.accept = ACCEPT
    input.style.display = "none"
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []).slice(0, MAX_LOCAL_ATTACHMENTS)
      cleanup()
      resolve(files)
    }, { once: true })
    window.addEventListener("focus", () => {
      window.setTimeout(() => {
        if (!input.isConnected) return
        cleanup()
        resolve([])
      }, 500)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

export function filesFromDataTransfer(data: DataTransfer | null | undefined): File[] {
  if (!data) return []
  const fromItems: File[] = []
  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue
      const file = item.getAsFile()
      if (file) fromItems.push(file)
    }
  }
  if (fromItems.length > 0) return fromItems.slice(0, MAX_LOCAL_ATTACHMENTS)
  return Array.from(data.files ?? []).slice(0, MAX_LOCAL_ATTACHMENTS)
}

export function filesFromClipboard(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const files = filesFromDataTransfer(clipboard)
  if (files.length > 0) return files

  // Some browsers expose pasted images only via items without FileList.
  const out: File[] = []
  for (const item of Array.from(clipboard.items ?? [])) {
    if (item.kind === "file") {
      const file = item.getAsFile()
      if (file) out.push(file)
      continue
    }
    // Ignore plain text paste — that stays in the composer value.
  }
  return out.slice(0, MAX_LOCAL_ATTACHMENTS)
}

export function attachmentFingerprint(file: LocalAttachment): string {
  return `${file.kind}:${file.name}:${file.size}:${(file.text ?? "").length}:${(file.dataBase64 ?? "").length}`
}
