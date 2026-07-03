import { describe, it, expect, beforeEach, afterEach } from "bun:test"

describe("canVoiceCapture", () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env = { PATH: origEnv.PATH, FFMPEG_PATH: origEnv.FFMPEG_PATH }
    delete process.env.ELEVENLABS_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.STT_PROVIDER
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  it("returns ok=false when ELEVENLABS_API_KEY is missing and STT_PROVIDER=elevenlabs", async () => {
    process.env.STT_PROVIDER = "elevenlabs"
    const { canVoiceCapture } = await import("../speech.ts")
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("ELEVENLABS_API_KEY")
  })

  it("returns ok=false when GROQ_API_KEY is missing and STT_PROVIDER=groq", async () => {
    process.env.STT_PROVIDER = "groq"
    const { canVoiceCapture } = await import("../speech.ts")
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("GROQ_API_KEY")
  })

  it("uses elevenlabs by default when STT_PROVIDER is unset", async () => {
    const { canVoiceCapture } = await import("../speech.ts")
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("ELEVENLABS_API_KEY")
  })

  it("returns ok=false with ffmpeg reason when ffmpeg is missing", async () => {
    process.env.ELEVENLABS_API_KEY = "sk-test"
    process.env.FFMPEG_PATH = "/nonexistent/ffmpeg"
    const { canVoiceCapture } = await import("../speech.ts")
    const result = canVoiceCapture()
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("ffmpeg")
  })
})

describe("getSttProvider", () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env = { PATH: origEnv.PATH }
    delete process.env.STT_PROVIDER
  })

  afterEach(() => {
    process.env = { ...origEnv }
  })

  it('returns "elevenlabs" when STT_PROVIDER is unset', async () => {
    const mod = await import("../speech.ts")
    expect((mod as any).getSttProvider()).toBe("elevenlabs")
  })

  it('returns "elevenlabs" when STT_PROVIDER is "elevenlabs"', async () => {
    process.env.STT_PROVIDER = "elevenlabs"
    const mod = await import("../speech.ts")
    expect((mod as any).getSttProvider()).toBe("elevenlabs")
  })

  it('returns "groq" when STT_PROVIDER is "groq"', async () => {
    process.env.STT_PROVIDER = "groq"
    const mod = await import("../speech.ts")
    expect((mod as any).getSttProvider()).toBe("groq")
  })

  it('returns "elevenlabs" for unknown STT_PROVIDER values', async () => {
    process.env.STT_PROVIDER = "invalid"
    const mod = await import("../speech.ts")
    expect((mod as any).getSttProvider()).toBe("elevenlabs")
  })
})
