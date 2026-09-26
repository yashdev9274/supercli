import { spawnSync, spawn, type ChildProcess } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { unlinkSync, readFileSync, writeFileSync } from "fs"
import { randomUUID } from "crypto"
import { getStoredToken } from "src/lib/token"

function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg"
}

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/speech-to-text"
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || "scribe_v1"
const STT_LANGUAGE = process.env.STT_LANGUAGE || "en"

/* groq provider */
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const GROQ_MODEL = process.env.GROQ_MODEL || "whisper-large-v3-turbo"

/* smallest.ai provider (Pulse STT) */
const SMALLEST_URL = "https://api.smallest.ai/waves/v1/stt/"
const SMALLEST_MODEL = process.env.SMALLEST_MODEL || "pulse-pro"
const SMALLEST_LANGUAGE = process.env.SMALLEST_LANGUAGE || STT_LANGUAGE || "en"

const DEFAULT_MAX_DURATION_MS = 4_000

let activeFfmpegProcess: ChildProcess | null = null

export type SttProvider = "elevenlabs" | "groq" | "smallest"

// Voice capture uses Smallest.ai (Pulse STT) exclusively.
export function getSttProvider(): SttProvider {
  return "smallest"
}

export function stopCapture(): void {
  if (activeFfmpegProcess) {
    activeFfmpegProcess.kill("SIGTERM")
    activeFfmpegProcess = null
  }
}

export function isFfmpegAvailable(): boolean {
  try {
    const out = spawnSync(getFfmpegPath(), ["-version"], { encoding: "utf-8", timeout: 3000 })
    return out.status === 0
  } catch {
    return false
  }
}

export function canVoiceCapture(): {
  ok: boolean
  reason?: string
} {
  if (!process.env.SMALLEST_API_KEY && !process.env.SUPERCODE_SERVER_URL)
    return { ok: false, reason: "SMALLEST_API_KEY not set and no server proxy configured" }

  if (!isFfmpegAvailable()) return { ok: false, reason: `ffmpeg not found at ${getFfmpegPath()}` }

  return { ok: true }
}

function captureAudio(
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
): Promise<{ base64: string; filePath: string }> {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `voice-${randomUUID()}.wav`)
    const stderrChunks: Buffer[] = []

    const proc = spawn(getFfmpegPath(), [
      "-f", "avfoundation",
      "-i", ":0",
      "-ac", "1",
      "-ar", "16000",
      "-sample_fmt", "s16",
      "-t", `${Math.ceil(maxDurationMs / 1000)}`,
      "-y", tmpFile,
    ], { stdio: ["ignore", "ignore", "pipe"] })

    activeFfmpegProcess = proc

    proc.stderr!.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk)
    })

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM")
    }, maxDurationMs + 5000)

    proc.on("exit", (code, signal) => {
      clearTimeout(timeout)
      activeFfmpegProcess = null

      const stderr = Buffer.concat(stderrChunks).toString("utf-8")

      let data: Buffer
      try {
        data = readFileSync(tmpFile)
      } catch {
        try { unlinkSync(tmpFile) } catch {}
        if (stderr.includes("No audio device") || stderr.includes("Input/output error")) {
          reject(new Error("Microphone not accessible — grant mic permission to your terminal in System Settings > Privacy & Security > Microphone"))
        } else {
          const snippet = stderr.split("\n").filter(l => l.includes("Error") || l.includes("device") || l.includes("No ")).slice(-3).join("; ") || "ffmpeg capture failed"
          reject(new Error(snippet))
        }
        return
      }

      if (data.length < 100) {
        unlinkSync(tmpFile)
        reject(new Error("No speech detected — try speaking louder"))
        return
      }

      resolve({ base64: data.toString("base64"), filePath: tmpFile })
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      activeFfmpegProcess = null
      try { unlinkSync(tmpFile) } catch {}
      reject(err)
    })
  })
}

export async function transcribeElevenLabs(filePath: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured")

  const formData = new FormData()
  formData.append("model_id", ELEVENLABS_MODEL)
  formData.append("file", Bun.file(filePath), "audio.wav")
  formData.append("tag_audio_events", "false")

  const start = performance.now()
  const res = await fetch(ELEVENLABS_URL, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
    signal: AbortSignal.timeout(15_000),
  })

  const body = await res.text().catch(() => "")
  const elapsed = ((performance.now() - start) / 1000).toFixed(2)

  if (!res.ok) {
    throw new Error(`ElevenLabs transcription error ${res.status}: ${body}`)
  }

  let data: { text?: string }
  try {
    data = JSON.parse(body) as { text?: string }
  } catch {
    throw new Error(`ElevenLabs transcription invalid JSON: ${body}`)
  }

  return data.text ?? ""
}

/* groq provider */
export async function transcribeGroq(filePath: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error("GROQ_API_KEY not configured")

  const formData = new FormData()
  formData.append("model", GROQ_MODEL)
  formData.append("file", Bun.file(filePath), "audio.wav")

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  const body = await res.text().catch(() => "")

  if (!res.ok) {
    throw new Error(`Groq transcription error ${res.status}: ${body}`)
  }

  let data: { text?: string }
  try {
    data = JSON.parse(body) as { text?: string }
  } catch {
    throw new Error(`Groq transcription invalid JSON: ${body}`)
  }

  return data.text ?? ""
}

/* smallest.ai provider (Pulse STT) */
export async function transcribeSmallest(filePath: string): Promise<string> {
  const apiKey = process.env.SMALLEST_API_KEY
  if (!apiKey) throw new Error("SMALLEST_API_KEY not configured")

  const params = new URLSearchParams({
    model: SMALLEST_MODEL,
    language: SMALLEST_LANGUAGE,
  })

  const start = performance.now()
  const res = await fetch(`${SMALLEST_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: Bun.file(filePath),
    signal: AbortSignal.timeout(30_000),
  })

  const body = await res.text().catch(() => "")
  const elapsed = ((performance.now() - start) / 1000).toFixed(2)

  if (!res.ok) {
    throw new Error(`Smallest transcription error ${res.status}: ${body}`)
  }

  let data: { transcription?: string }
  try {
    data = JSON.parse(body) as { transcription?: string }
  } catch {
    throw new Error(`Smallest transcription invalid JSON: ${body}`)
  }

  if (data.transcription === undefined) {
    throw new Error(`Smallest transcription missing "transcription": ${body}`)
  }

  return data.transcription
}

async function transcribeViaServer(filePath: string): Promise<string> {
  const serverUrl = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"
  const token = await getStoredToken()
  if (!token?.access_token) {
    throw new Error("Not authenticated. Please login first.")
  }

  const audioData = readFileSync(filePath)
  const base64 = audioData.toString("base64")

  const res = await fetch(`${serverUrl}/api/voice/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({ base64, provider: getSttProvider() }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Server transcription failed (${res.status}): ${text}`)
  }

  const { text } = (await res.json()) as { text?: string }
  return text ?? ""
}

export async function transcribeAudio(filePath: string): Promise<string> {
  if (process.env.SMALLEST_API_KEY) return transcribeSmallest(filePath)
  return transcribeViaServer(filePath)
}

// ─── Text-to-speech (spoken reply) ──────────────────────────────────────────
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"
const ELEVENLABS_TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL || "eleven_turbo_v2_5"
const SPEECH_MAX_CHARS = 3000
const VOICE_REPLY_ENABLED = (process.env.VOICE_REPLY ?? "on").toLowerCase() !== "off"

export function isTtsAvailable(): boolean {
  if (!VOICE_REPLY_ENABLED) return false
  // Spoken replies are played back with macOS `afplay` / `say`
  return process.platform === "darwin"
}

// Strip markdown so the reply reads naturally instead of reading code verbatim.
export function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[#*_~>|]/g, "")
    .replace(/^\s{2,}/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, SPEECH_MAX_CHARS)
}

function playAudioFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn("afplay", [filePath])
    proc.on("exit", () => {
      try { unlinkSync(filePath) } catch {}
      resolve()
    })
    proc.on("error", () => {
      try { unlinkSync(filePath) } catch {}
      resolve()
    })
  })
}

function speakWithSay(text: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn("say", [])
    proc.on("exit", () => resolve())
    proc.on("error", () => resolve())
    proc.stdin?.write(text)
    proc.stdin?.end()
  })
}

export async function speakText(text: string): Promise<void> {
  if (!isTtsAvailable()) return
  const clean = stripForSpeech(text)
  if (!clean) return

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    // Local fallback — no API key needed
    await speakWithSay(clean)
    return
  }

  try {
    const res = await fetch(`${ELEVENLABS_TTS_URL}/${ELEVENLABS_VOICE_ID}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: clean, model_id: ELEVENLABS_TTS_MODEL }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`ElevenLabs TTS error ${res.status}: ${body}`)
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const tmpFile = join(tmpdir(), `tts-${randomUUID()}.mp3`)
    writeFileSync(tmpFile, bytes)
    await playAudioFile(tmpFile)
  } catch {
    // Fall back to local `say` on any network/fetch failure
    await speakWithSay(clean)
  }
}

const SOUND_DESCRIPTION_RE = /\([^)]*?(?:noise|clicking|static|static|background|sound|audio|speaking|unintelligible|laughs?|coughs?|clears?\s+(?:throat|voice)|throat|pause|music|beep|tone|silence|indistinct|foreign|applause|sniffling|sighs?|breathing|rustling|mumbling|chatter|echo)[^)]*?\)/gi

function sanitizeTranscription(text: string): string {
  return text.replace(SOUND_DESCRIPTION_RE, "").trim()
}

export async function voiceCaptureFlow(): Promise<string> {
  const { base64, filePath } = await captureAudio()

  try {
    const text = await transcribeAudio(filePath)
    const cleaned = sanitizeTranscription(text)
    if (!cleaned || cleaned.length < 2 || !/[a-zA-Z0-9]/.test(cleaned)) {
      return ""
    }
    return cleaned
  } finally {
    try { unlinkSync(filePath) } catch {}
  }
}
