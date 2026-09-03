import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  canVoiceCapture,
  getSttProvider,
  isTtsAvailable,
  stripForSpeech,
} from "../speech"

// Point ffmpeg at a binary that accepts "--version" (any arg) so the
// SMALLEST_API_KEY branch of canVoiceCapture is reachable on every host.
const FFMPEG_STUB = "/bin/echo"

describe("canVoiceCapture", () => {
  const origEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of [
      "FFMPEG_PATH",
      "SMALLEST_API_KEY",
      "ELEVENLABS_API_KEY",
      "GROQ_API_KEY",
      "STT_PROVIDER",
      "SUPERCODE_SERVER_URL",
    ]) {
      origEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("returns ok=false when SMALLEST_API_KEY is missing", () => {
    process.env.FFMPEG_PATH = FFMPEG_STUB
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("SMALLEST_API_KEY")
  })

  it("returns ok=false with ffmpeg reason when ffmpeg is missing", () => {
    process.env.SMALLEST_API_KEY = "sk-test"
    process.env.FFMPEG_PATH = "/nonexistent/ffmpeg"
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("ffmpeg")
  })
})

describe("getSttProvider", () => {
  const origSttProvider = process.env.STT_PROVIDER

  afterEach(() => {
    if (origSttProvider === undefined) delete process.env.STT_PROVIDER
    else process.env.STT_PROVIDER = origSttProvider
  })

  it('always returns "smallest" (Smallest.ai is the only STT provider)', () => {
    delete process.env.STT_PROVIDER
    expect(getSttProvider()).toBe("smallest")
  })

  it('ignores STT_PROVIDER and still returns "smallest"', () => {
    process.env.STT_PROVIDER = "groq"
    expect(getSttProvider()).toBe("smallest")
  })
})

describe("stripForSpeech", () => {
  it("removes code fences and inline code", () => {
    const out = stripForSpeech(
      "Here is the fix:\n```ts\nconst x = 1\n```\nUse `y` instead.",
    )
    expect(out).not.toContain("```")
    expect(out).not.toContain("const x = 1")
    expect(out).toContain("Here is the fix")
    expect(out).toContain("y instead")
  })

  it("strips markdown symbols, links, and headings", () => {
    const out = stripForSpeech(
      "# Title\n\n- one\n- two\n\nSee [docs](https://example.com) for **more**.",
    )
    expect(out).not.toContain("#")
    expect(out).not.toContain("https://example.com")
    expect(out).toContain("docs")
    expect(out).toContain("more")
  })

  it("truncates to SPEECH_MAX_CHARS", () => {
    const long = "word ".repeat(2000)
    const out = stripForSpeech(long)
    expect(out.length).toBeLessThanOrEqual(3000)
  })
})

describe("isTtsAvailable", () => {
  it("returns a boolean reflecting the platform (darwin only)", () => {
    const result = isTtsAvailable()
    expect(typeof result).toBe("boolean")
    expect(result).toBe(process.platform === "darwin")
  })
})
