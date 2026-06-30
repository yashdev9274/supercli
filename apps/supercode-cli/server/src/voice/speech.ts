import { spawnSync, spawn, type ChildProcess } from "child_process"
import { tmpdir } from "os"
import { join } from "path"
import { unlinkSync, readFileSync } from "fs"
import { randomUUID } from "crypto"

const FFMPEG_PATH = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg"
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
const GROQ_MODEL = process.env.GROQ_MODEL || "whisper-large-v3-turbo"

const DEFAULT_MAX_DURATION_MS = 8_000

let activeFfmpegProcess: ChildProcess | null = null
let activeFfmpegUserAbort = false

export function abortCapture(): void {
  if (activeFfmpegProcess) {
    activeFfmpegUserAbort = true
    activeFfmpegProcess.kill("SIGTERM")
    activeFfmpegProcess = null
  }
}

export function isFfmpegAvailable(): boolean {
  try {
    const out = spawnSync(FFMPEG_PATH, ["-version"], { encoding: "utf-8", timeout: 3000 })
    return out.status === 0
  } catch {
    return false
  }
}

export function canVoiceCapture(): {
  ok: boolean
  reason?: string
} {
  if (!isFfmpegAvailable()) return { ok: false, reason: `ffmpeg not found at ${FFMPEG_PATH}` }
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return { ok: false, reason: "GROQ_API_KEY not set" }
  return { ok: true }
}

function captureAudio(
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
): Promise<{ base64: string; filePath: string }> {
  return new Promise((resolve, reject) => {
    const tmpFile = join(tmpdir(), `voice-${randomUUID()}.wav`)
    const stderrChunks: Buffer[] = []

    const proc = spawn(FFMPEG_PATH, [
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
      const userAborted = activeFfmpegUserAbort
      activeFfmpegUserAbort = false

      const stderr = Buffer.concat(stderrChunks).toString("utf-8")

      let data: Buffer
      try {
        data = readFileSync(tmpFile)
      } catch {
        try { unlinkSync(tmpFile) } catch {}
        if (stderr.includes("No audio device") || stderr.includes("Input/output error")) {
          reject(new Error("Microphone not accessible — grant mic permission to your terminal in System Settings > Privacy & Security > Microphone"))
        } else if (userAborted) {
          reject(new Error("No audio captured"))
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
      activeFfmpegUserAbort = false
      try { unlinkSync(tmpFile) } catch {}
      reject(err)
    })
  })
}

export async function transcribeAudio(filePath: string): Promise<string> {
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

export async function voiceCaptureFlow(): Promise<string> {
  const { base64, filePath } = await captureAudio()

  try {
    const text = await transcribeAudio(filePath)
    const trimmed = text.trim()
    if (!trimmed) {
      throw new Error("No speech detected in recording")
    }
    if (trimmed.length < 2 || !/[a-zA-Z0-9]/.test(trimmed)) {
      throw new Error("No clear speech detected — try speaking louder or longer")
    }
    return trimmed
  } finally {
    try { unlinkSync(filePath) } catch {}
  }
}