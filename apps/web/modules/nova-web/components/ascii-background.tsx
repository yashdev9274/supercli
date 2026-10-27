"use client"

import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Pause, Play } from "lucide-react"

const GLYPHS = " .,:;~+=*#"
const FRAME_MS = 1000 / 30

const subscribeToHydration = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false

export const AsciiBackground = memo(function AsciiBackground({ color = "#a3aaa7" }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const elapsedRef = useRef(0)
  const reducedMotion = useReducedMotion()
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let previous = 0
    let lastPaint = 0
    let visible = true
    const animate = reducedMotion === false && !paused

    function draw() {
      if (!context) return
      context.clearRect(0, 0, width, height)
      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace"
      context.textAlign = "center"
      context.textBaseline = "middle"
      context.fillStyle = color
      const time = elapsedRef.current * 0.0003
      const cell = Math.max(12, width / 130, height / 80)
      const scale = Math.max(Math.min(width, height), 1)

      for (let y = cell / 2; y < height; y += cell) {
        for (let x = cell / 2; x < width; x += cell) {
          const nx = (x - width / 2) / Math.max(width, 1)
          const ny = (y - height / 2) / Math.max(height, 1)
          const px = (x - width / 2) / scale
          const py = (y - height / 2) / scale
          // Domain-warped contour bands drift like a living topographic map.
          const flowX = px + Math.sin(py * 3.5 + time * 0.45) * 0.24
          const flowY = py + Math.cos(px * 3 - time * 0.35) * 0.2
          const field = Math.sin(flowX * 4 + time * 0.55)
            + Math.cos(flowY * 5 - time * 0.4)
            + Math.sin((flowX + flowY) * 3 + time * 0.3) * 0.5
          const contour = Math.pow(0.5 + 0.5 * Math.cos(field * 9 - time), 8)
          const mist = (Math.sin(flowX * 8 - flowY * 6 + time) + 1) * 0.5
          const density = Math.min(1, contour * 0.85 + mist * 0.15)
          const glyph = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(density * GLYPHS.length))]
          if (glyph === " ") continue
          const edge = Math.max(0, 1 - Math.pow(Math.abs(nx) * 2, 4))
            * Math.max(0, 1 - Math.pow(Math.abs(ny) * 2, 4))
          // Leave a quiet pocket behind the composer and project controls.
          const pocket = 1 - 0.92 * Math.exp(-(nx * nx * 18 + (ny + 0.06) ** 2 * 26))
          context.globalAlpha = (0.08 + density * 0.45) * edge * pocket
          context.fillText(glyph, x, y)
        }
      }
      context.globalAlpha = 1
    }

    function tick(now: number) {
      frame = 0
      if (document.hidden || !visible || !animate) return
      if (previous) elapsedRef.current += Math.min(now - previous, 100)
      previous = now
      if (now - lastPaint >= FRAME_MS) {
        draw()
        lastPaint = now
      }
      frame = requestAnimationFrame(tick)
    }

    function syncAnimation() {
      cancelAnimationFrame(frame)
      frame = 0
      previous = 0
      if (animate && !document.hidden && visible) frame = requestAnimationFrame(tick)
    }

    const resize = new ResizeObserver(([entry]) => {
      if (!entry || !context) return
      width = entry.contentRect.width
      height = entry.contentRect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    })
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      syncAnimation()
    })
    resize.observe(canvas)
    intersection.observe(canvas)
    document.addEventListener("visibilitychange", syncAnimation)
    syncAnimation()

    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      intersection.disconnect()
      document.removeEventListener("visibilitychange", syncAnimation)
    }
  }, [color, paused, reducedMotion])

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden select-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: hydrated && reducedMotion ? 0 : 1.4 }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </motion.div>
      {hydrated && reducedMotion === false ? (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Play background animation" : "Pause background animation"}
          aria-pressed={paused}
          title={paused ? "Play background animation" : "Pause background animation"}
          className="absolute right-4 bottom-4 z-[2] flex size-8 items-center justify-center rounded-full border border-[var(--chat-border)] bg-[var(--chat-bg)] text-[var(--chat-muted)] transition hover:bg-[var(--chat-hover)] hover:text-[var(--chat-text)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
        </button>
      ) : null}
    </>
  )
})
