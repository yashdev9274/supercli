import { stripVTControlCharacters } from "node:util"

/** Untrusted content must never move the cursor, set titles, or create OSC links. */
export function sanitizeTerminalText(value: string): string {
  return stripVTControlCharacters(value.replace(/\r\n/g, "\n"))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\t/g, "    ")
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
export function terminalCells(text: string): number {
  let cells = 0
  for (const { segment } of segmenter.segment(text)) {
    if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(segment)) continue
    const cp = segment.codePointAt(0) ?? 0
    cells += /\p{Emoji_Presentation}|\p{Regional_Indicator}|\ufe0f/u.test(segment) ||
      (cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe10 && cp <= 0xfe6f) ||
        (cp >= 0xff01 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || cp >= 0x20000)) ? 2 : 1
  }
  return cells
}

/** Soft wrapping, never truncation; concatenating chunks recovers the input. */
export function wrapTerminalText(text: string, width: number): string[] {
  const lines: string[] = []
  const limit = Math.max(2, Math.floor(width))
  for (const logical of text.split("\n")) {
    let line = ""
    let cells = 0
    for (const { segment } of segmenter.segment(logical)) {
      const size = terminalCells(segment)
      if (cells + size > limit && line) {
        lines.push(line)
        line = ""
        cells = 0
      }
      line += segment
      cells += size
    }
    lines.push(line)
  }
  return lines
}
