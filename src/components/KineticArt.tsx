import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import type { EngineState } from '../audio/types'
import { hexToRgba } from '../shared/color'
import { clamp, lerp } from '../shared/math'
import './KineticArt.css'

// Mirrors the --accent token in index.css - canvas drawing can't read CSS
// custom properties. Monochrome by design: every bar is this one lime, only
// brightness/opacity vary.
const ACCENT = '#b4ff3c'
const ACCENT_TIP = '#e8ffb0'
const BAR_COUNT = 160
const FOV = 460
const VIEWER_Z = 560
const TILT_X = 1.18 // fixed camera-like tilt (~68°), the disc spins under it

interface Vec3 {
  x: number
  y: number
  z: number
}

interface Projected {
  x: number
  y: number
  scale: number
}

function rotateX(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}

function rotateY(p: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c }
}

function project(p: Vec3, w: number, h: number): Projected {
  const scale = FOV / (FOV + p.z + VIEWER_Z)
  return { x: w / 2 + p.x * scale, y: h / 2 + p.y * scale * 0.72, scale }
}

interface KineticArtProps {
  engine: AudioEngine
  engineState: EngineState
}

/**
 * A circular spectrum ring viewed in perspective and spinning like a
 * record - a tilted disc of radial bars, each bar's length taken straight
 * from one frequency bin, wrapped around a full 360°. Monochrome lime
 * instead of a rainbow: loudness and depth drive brightness, not hue.
 * Frequency content comes from the engine's post-effects AnalyserNode
 * (always live, independent of Adaptive Audio); rotation speed, echo
 * trails, glow, and which side of the spectrum reads louder come from the
 * live speed/delay/reverb/filter state.
 */
export function KineticArt({ engine, engineState }: KineticArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(engineState)
  stateRef.current = engineState

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const freq = new Uint8Array(engine.visualizerBinCount)
    let wave = new Uint8Array(0)

    let running = true
    let raf = 0
    let lastTime: number | null = null
    let globalAngle = 0
    let smoothedLevel = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)

    const loop = (now: number) => {
      if (!running) return
      const dt = lastTime === null ? 1 / 60 : Math.min(0.1, (now - lastTime) / 1000)
      lastTime = now

      engine.getFrequencyData(freq)
      wave = engine.getWaveformData(wave.length ? wave : undefined)

      const rect = canvas.getBoundingClientRect()
      const s = stateRef.current

      let sumSquares = 0
      for (let i = 0; i < wave.length; i++) {
        const v = (wave[i] - 128) / 128
        sumSquares += v * v
      }
      const rms = wave.length ? Math.sqrt(sumSquares / wave.length) : 0
      const targetLevel = s.isPlaying ? clamp(rms * 2.6, 0, 1) : 0
      smoothedLevel = lerp(smoothedLevel, targetLevel, clamp(dt * 6, 0, 1))

      const rotationSpeed = (0.16 + s.speed.rate * 0.3) * (s.isPlaying ? 1 : 0.08)
      globalAngle += rotationSpeed * dt

      drawScene(ctx, rect.width, rect.height, freq, s, smoothedLevel, globalAngle, now / 1000)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
    }
  }, [engine])

  return (
    <div className="kinetic-art" aria-hidden="true">
      <canvas ref={canvasRef} className="kinetic-art__canvas" />
    </div>
  )
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array<ArrayBuffer>,
  state: EngineState,
  level: number,
  globalAngle: number,
  timeSec: number,
): void {
  ctx.clearRect(0, 0, w, h)

  const maxRadius = Math.min(w, h) * 0.42 * (0.85 + state.volume * 0.25)
  const glow = state.reverb.wet

  const echoPasses = Math.round(state.delay.wet * 3)
  for (let pass = echoPasses; pass >= 1; pass--) {
    const echoAlpha = (1 - pass / (echoPasses + 1)) * 0.35 * Math.max(0.2, state.delay.wet)
    drawRing(ctx, w, h, freq, maxRadius, globalAngle - pass * 0.11, level, state.filter.value, 0, echoAlpha, timeSec, state.isPlaying)
  }
  drawRing(ctx, w, h, freq, maxRadius, globalAngle, level, state.filter.value, glow, 1, timeSec, state.isPlaying)
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  freq: Uint8Array<ArrayBuffer>,
  maxRadius: number,
  globalAngle: number,
  level: number,
  filterValue: number,
  glow: number,
  alphaScale: number,
  timeSec: number,
  isPlaying: boolean,
): void {
  const innerRadius = maxRadius * 0.34

  // Soft core bloom - "the effect is lit up", brightening with loudness
  // and reverb wet, sitting under everything else.
  const bloomRadius = maxRadius * (0.55 + level * 0.25 + glow * 0.3)
  const bloom = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, bloomRadius)
  bloom.addColorStop(0, hexToRgba(ACCENT, (0.16 + level * 0.14 + glow * 0.1) * alphaScale))
  bloom.addColorStop(1, hexToRgba(ACCENT, 0))
  ctx.save()
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.fillStyle = bloom
  ctx.arc(w / 2, h / 2, bloomRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Base track - a thin dim circle marking the hub, like a record label edge.
  ctx.beginPath()
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2
    const p = project(rotateX(rotateY({ x: Math.cos(t) * innerRadius, y: 0, z: Math.sin(t) * innerRadius }, globalAngle), TILT_X), w, h)
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.closePath()
  ctx.strokeStyle = hexToRgba(ACCENT, 0.14 * alphaScale)
  ctx.lineWidth = 1
  ctx.shadowBlur = 0
  ctx.stroke()

  for (let i = 0; i < BAR_COUNT; i++) {
    const t = (i / BAR_COUNT) * Math.PI * 2
    const binIndex = Math.floor((i / BAR_COUNT) * freq.length)
    const magnitude = freq.length ? freq[binIndex] / 255 : 0

    // No audio yet - keep the ring alive with a gentle traveling idle wave
    // instead of going flat and looking broken.
    const idle = 0.12 + 0.08 * Math.sin(t * 5 + timeSec * 1.1)
    const norm = i / BAR_COUNT
    const filterGain = 1 + filterValue * (norm - 0.5) * 0.7
    const effective = clamp((isPlaying ? magnitude : idle) * Math.max(0.15, filterGain), 0, 1.4)

    const barLen = maxRadius * (0.06 + effective * 0.62) * (0.9 + level * 0.35)

    const inner: Vec3 = { x: Math.cos(t) * innerRadius, y: 0, z: Math.sin(t) * innerRadius }
    const outer: Vec3 = { x: Math.cos(t) * (innerRadius + barLen), y: 0, z: Math.sin(t) * (innerRadius + barLen) }

    const pInner = project(rotateX(rotateY(inner, globalAngle), TILT_X), w, h)
    const pOuter = project(rotateX(rotateY(outer, globalAngle), TILT_X), w, h)

    const depthAlpha = clamp((pOuter.scale - 0.72) / 0.5, 0.15, 1)
    const brightness = clamp(0.35 + effective * 0.65, 0, 1)
    const a = depthAlpha * brightness * alphaScale

    const gradient = ctx.createLinearGradient(pInner.x, pInner.y, pOuter.x, pOuter.y)
    gradient.addColorStop(0, hexToRgba(ACCENT, a * 0.35))
    gradient.addColorStop(1, hexToRgba(ACCENT_TIP, a))

    ctx.beginPath()
    ctx.strokeStyle = gradient
    ctx.lineWidth = Math.max(0.7, 1.8 * pOuter.scale)
    // Always glowing, at least a little - reverb pours on extra bloom.
    ctx.shadowColor = ACCENT
    ctx.shadowBlur = 4 + brightness * 6 + glow * 20
    ctx.moveTo(pInner.x, pInner.y)
    ctx.lineTo(pOuter.x, pOuter.y)
    ctx.stroke()
  }
}
