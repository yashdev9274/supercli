export type ChatAppearance = {
  background: string
  ascii: string
  text: string | null
}

export const DEFAULT_CHAT_APPEARANCE: ChatAppearance = {
  background: "#101010",
  ascii: "#a3aaa7",
  text: null,
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function parseChatAppearance(raw: string | null): ChatAppearance {
  try {
    const value: unknown = JSON.parse(raw ?? "null")
    if (!value || typeof value !== "object") return DEFAULT_CHAT_APPEARANCE
    const record = value as Record<string, unknown>
    const color = (key: string, fallback: string) =>
      typeof record[key] === "string" && HEX_COLOR.test(record[key]) ? record[key] : fallback
    return {
      background: color("background", DEFAULT_CHAT_APPEARANCE.background),
      ascii: color("ascii", DEFAULT_CHAT_APPEARANCE.ascii),
      text: typeof record.text === "string" && HEX_COLOR.test(record.text) ? record.text : null,
    }
  } catch {
    return DEFAULT_CHAT_APPEARANCE
  }
}

export function contrastingText(background: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(background.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  return luminance > 0.179 ? "#000000" : "#ffffff"
}
