import type { HandLandmarker } from '@mediapipe/tasks-vision'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CommandBus } from '../commands/commandBus'
import { HandGestureController, type GestureMapperState } from '../gesture/gestureMapper'
import { LandmarkSmoother } from '../gesture/normalize'
import { configFromSensitivity, type PinchConfig } from '../gesture/pinchStateMachine'
import type { Handedness, Landmark } from '../gesture/types'
import { loadHandLandmarker } from './loadHandLandmarker'

export type CameraStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'off' | 'error'
export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface HandFrameData {
  hand: Handedness
  landmarks: Landmark[]
  score: number
  gesture: GestureMapperState
}

export interface FrameData {
  timestampMs: number
  fps: number
  hands: HandFrameData[]
}

export interface UseHandTrackingOptions {
  videoRef: RefObject<HTMLVideoElement | null>
  bus: CommandBus
  enabled: boolean
  sensitivity: number
  onFrame?: (data: FrameData) => void
}

export interface UseHandTrackingResult {
  cameraStatus: CameraStatus
  trackerStatus: TrackerStatus
  errorMessage: string | null
  fps: number
}

/**
 * MediaPipe's handedness label assumes mirrored/selfie input; we feed it the
 * raw <video> frame, which in theory should require swapping the label. In
 * practice, on real hardware, `getUserMedia({facingMode: 'user'})` frequently
 * already delivers a pre-mirrored track (many camera drivers mirror the
 * front camera before it ever reaches the page), which cancels out the
 * theoretical swap. Confirmed by hand: swapping here made every gesture
 * fire on the wrong physical hand, so we pass the raw label through as-is.
 */
function correctHandedness(rawLabel: string): Handedness {
  return rawLabel === 'Left' ? 'Left' : 'Right'
}

function toLandmarks(points: { x: number; y: number; z: number }[]): Landmark[] {
  return points.map((p) => ({ x: p.x, y: p.y, z: p.z }))
}

/**
 * Owns camera acquisition + MediaPipe HandLandmarker inference + per-hand
 * smoothing + the two HandGestureController instances, and drives them all
 * from a single requestAnimationFrame loop. Emits processed per-frame data
 * via `onFrame` for the camera UI to render; contains no drawing code
 * itself.
 */
export function useHandTracking(options: UseHandTrackingOptions): UseHandTrackingResult {
  const { videoRef, bus, enabled, sensitivity, onFrame } = options

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fps, setFps] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef<number | null>(null)
  const smoothersRef = useRef<Record<Handedness, LandmarkSmoother>>({
    Left: new LandmarkSmoother(4),
    Right: new LandmarkSmoother(4),
  })
  const controllersRef = useRef<Record<Handedness, HandGestureController> | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const fpsRef = useRef(0)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  if (!controllersRef.current) {
    controllersRef.current = {
      Left: new HandGestureController('Left', bus),
      Right: new HandGestureController('Right', bus),
    }
  }

  // Keep pinch sensitivity in sync without recreating the controllers.
  useEffect(() => {
    const config: PinchConfig = configFromSensitivity(sensitivity)
    controllersRef.current?.Left.setSensitivity(config)
    controllersRef.current?.Right.setSensitivity(config)
  }, [sensitivity])

  useEffect(() => {
    if (!enabled) {
      stopCamera(streamRef, videoRef)
      setCameraStatus('off')
      return
    }

    let cancelled = false

    async function start() {
      setCameraStatus('requesting')
      setErrorMessage(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unavailable')
        setErrorMessage('This browser does not expose camera access (getUserMedia unavailable).')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
        }
        setCameraStatus('granted')
      } catch (err) {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : 'Error'
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraStatus('denied')
          setErrorMessage('Camera permission was denied. Grant access in the browser address bar to use gesture control.')
        } else if (name === 'NotFoundError') {
          setCameraStatus('unavailable')
          setErrorMessage('No camera device was found.')
        } else {
          setCameraStatus('error')
          setErrorMessage(err instanceof Error ? err.message : 'Unknown camera error.')
        }
      }

      try {
        setTrackerStatus('loading')
        landmarkerRef.current = await loadHandLandmarker()
        if (cancelled) return
        setTrackerStatus('ready')
      } catch (err) {
        if (cancelled) return
        setTrackerStatus('error')
        setErrorMessage((prev) => prev ?? (err instanceof Error ? err.message : 'Failed to load hand tracking model.'))
      }
    }

    void start()

    return () => {
      cancelled = true
      stopCamera(streamRef, videoRef)
    }
  }, [enabled, videoRef])

  useEffect(() => {
    if (!enabled) return
    if (cameraStatus !== 'granted' || trackerStatus !== 'ready') return

    const controllers = controllersRef.current
    if (!controllers) return

    let running = true

    const loop = () => {
      if (!running) return
      const video = videoRef.current
      const landmarker = landmarkerRef.current
      const now = performance.now()

      if (video && landmarker && video.readyState >= 2) {
        const result = landmarker.detectForVideo(video, now)

        const seen: Record<Handedness, boolean> = { Left: false, Right: false }
        const hands: HandFrameData[] = []

        for (let i = 0; i < result.landmarks.length; i++) {
          const rawLabel = result.handedness[i]?.[0]?.categoryName ?? 'Left'
          const hand = correctHandedness(rawLabel)
          const score = result.handedness[i]?.[0]?.score ?? 0
          const rawLandmarks = toLandmarks(result.landmarks[i])
          const smoothed = smoothersRef.current[hand].push(rawLandmarks)
          seen[hand] = true
          const gesture = controllers[hand].update(smoothed, now, 'gesture')
          hands.push({ hand, landmarks: smoothed, score, gesture })
        }

        for (const side of ['Left', 'Right'] as Handedness[]) {
          if (!seen[side]) controllers[side].update(null, now, 'gesture')
        }

        if (lastFrameTimeRef.current !== null) {
          const dt = now - lastFrameTimeRef.current
          if (dt > 0) {
            const instantFps = 1000 / dt
            fpsRef.current = fpsRef.current === 0 ? instantFps : fpsRef.current * 0.9 + instantFps * 0.1
            setFps(fpsRef.current)
          }
        }
        lastFrameTimeRef.current = now

        onFrameRef.current?.({ timestampMs: now, fps: fpsRef.current, hands })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      running = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastFrameTimeRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cameraStatus, trackerStatus, videoRef])

  return { cameraStatus, trackerStatus, errorMessage, fps }
}

function stopCamera(streamRef: RefObject<MediaStream | null>, videoRef: RefObject<HTMLVideoElement | null>): void {
  streamRef.current?.getTracks().forEach((t) => t.stop())
  streamRef.current = null
  if (videoRef.current) videoRef.current.srcObject = null
}
