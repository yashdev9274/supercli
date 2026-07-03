import { spawnSync, spawn, type ChildProcess } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { unlinkSync, readFileSync } from "fs"
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



const DEFAULT_MAX_DURATION_MS = 4_000

let activeFfmpegProcess: ChildProcess | null = null

export function getSttProvider(): "elevenlabs" | "groq" {
  const raw = process.env.STT_PROVIDER || "elevenlabs"
  if (raw === "groq") return "groq"
  return "elevenlabs"
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
  if (!isFfmpegAvailable()) return { ok: false, reason: `ffmpeg not found at ${getFfmpegPath()}` }

  const provider = getSttProvider()
  if (provider === "groq") {
    if (!process.env.GROQ_API_KEY && !process.env.SUPERCODE_SERVER_URL)
      return { ok: false, reason: "GROQ_API_KEY not set and no server proxy configured" }
  } else {
    if (!process.env.ELEVENLABS_API_KEY && !process.env.SUPERCODE_SERVER_URL)
      return { ok: false, reason: "ELEVENLABS_API_KEY not set and no server proxy configured" }
  }

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
  const provider = getSttProvider()

  if (provider === "groq") {
    if (process.env.GROQ_API_KEY) return transcribeGroq(filePath)
    return transcribeViaServer(filePath)
  }

  if (process.env.ELEVENLABS_API_KEY) return transcribeElevenLabs(filePath)
  return transcribeViaServer(filePath)
}

const SOUND_DESCRIPTION_RE = /\([^)]*?(?:noise|clicking|static|background|sound|audio|speaking|unintelligible|laughs?|coughs?|clears?\s+(?:throat|voice)|throat|pause|music|beep|tone|silence|indistinct|foreign|applause|sniffling|sighs?|breathing|rustling|mumbling|chatter|echo)[^)]*?\)/gi

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
