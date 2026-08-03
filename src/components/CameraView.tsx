import { useEffect, useRef, useState } from 'react'
import type { CommandBus } from '../commands/commandBus'
import { HAND_CONNECTIONS } from '../handtracking/handConnections'
import { type FrameData, type HandFrameData, useHandTracking } from '../handtracking/useHandTracking'
import { configFromSensitivity } from '../gesture/pinchStateMachine'
import { FINGERS, FINGER_TIP_LANDMARK, type Handedness } from '../gesture/types'
import { hexToRgba } from '../shared/color'
import { useAppStore } from '../state/useAppStore'
import { useDraggable } from './useDraggable'
import './CameraView.css'

// Mirrors the --accent token in index.css - canvas drawing can't read CSS
// custom properties, so the point color is duplicated here deliberately.
// Both hands share it; position + the DECK L/R label tell them apart.
const DECK_COLOR: Record<Handedness, string> = {
  Left: '#b4ff3c',
  Right: '#b4ff3c',
}
const NEAR_THRESHOLD_COLOR = 'rgba(255, 204, 77, 0.55)'
const IDLE_DOT_COLOR = 'rgba(212, 212, 212, 0.22)'

interface CameraViewProps {
  bus: CommandBus
}

export function CameraView({ bus }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [locked, setLocked] = useState(false)
  const { panelRef, position, dragHandlers } = useDraggable()

  const cameraEnabled = useAppStore((s) => s.cameraEnabled)
  const sensitivity = useAppStore((s) => s.sensitivity)
  const setHandFrame = useAppStore((s) => s.setHandFrame)
  const setTrackingStatus = useAppStore((s) => s.setTrackingStatus)

  const thresholdsRef = useRef(configFromSensitivity(sensitivity))
  thresholdsRef.current = configFromSensitivity(sensitivity)

  const handleFrame = (data: FrameData) => {
    setHandFrame(data)
    draw(canvasRef.current, videoRef.current, data.hands, thresholdsRef.current)
    setLocked(data.hands.some((h) => FINGERS.some((f) => h.gesture[f].isPinching)))
  }

  const { cameraStatus, trackerStatus, errorMessage, fps } = useHandTracking({
    videoRef,
    bus,
    enabled: cameraEnabled,
    sensitivity,
    onFrame: handleFrame,
  })

  useEffect(() => {
    if (!cameraEnabled) {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [cameraEnabled])

  useEffect(() => {
    setTrackingStatus({ cameraStatus, trackerStatus, fps, errorMessage })
  }, [cameraStatus, trackerStatus, fps, errorMessage, setTrackingStatus])

  const showOverlayMessage =
    !cameraEnabled || cameraStatus === 'denied' || cameraStatus === 'unavailable' || cameraStatus === 'error'

  return (
    <div
      ref={panelRef}
      className={`camera-view ${locked ? 'camera-view--locked' : ''}`}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={dragHandlers.onPointerDown}
      onPointerMove={dragHandlers.onPointerMove}
      onPointerUp={dragHandlers.onPointerUp}
      onPointerCancel={dragHandlers.onPointerUp}
      role="group"
      aria-label="카메라 미리보기 - 드래그해서 위치를 옮길 수 있습니다"
    >
      <video ref={videoRef} className="camera-view__video" muted playsInline aria-hidden="true" />
      <canvas ref={canvasRef} width={640} height={480} className="camera-view__canvas" />
      <div className="camera-view__vignette" aria-hidden="true" />

      <span className="camera-view__bracket camera-view__bracket--tl" aria-hidden="true" />
      <span className="camera-view__bracket camera-view__bracket--tr" aria-hidden="true" />
      <span className="camera-view__bracket camera-view__bracket--bl" aria-hidden="true" />
      <span className="camera-view__bracket camera-view__bracket--br" aria-hidden="true" />
      <span className="camera-view__drag-grip" aria-hidden="true" />

      <div className="camera-view__hud" aria-hidden="true">
        <span className={`camera-view__lock ${locked ? 'camera-view__lock--on' : ''}`}>{locked ? 'LOCK' : 'SCAN'}</span>
        <span>{cameraStatus === 'granted' ? `${Math.round(fps)}fps` : trackerStatus === 'loading' ? 'loading model…' : ''}</span>
      </div>

      {showOverlayMessage && (
        <div className="camera-view__overlay" role="status">
          {!cameraEnabled && <p>카메라가 꺼져 있습니다. 하단의 CAM 스위치를 켜세요.</p>}
          {cameraEnabled && cameraStatus === 'denied' && (
            <p>카메라 권한이 거부됐습니다. 주소창의 카메라 아이콘에서 권한을 허용하고 새로고침하세요.</p>
          )}
          {cameraEnabled && cameraStatus === 'unavailable' && <p>연결된 카메라가 없습니다. 하단의 SIM 스위치로 키보드 시뮬레이션을 사용하세요.</p>}
          {cameraEnabled && cameraStatus === 'error' && <p>카메라 오류 — {errorMessage}</p>}
        </div>
      )}
    </div>
  )
}

function draw(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  hands: HandFrameData[],
  thresholds: ReturnType<typeof configFromSensitivity>,
): void {
  if (!canvas || !video) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Mirror the drawing surface so the preview reads naturally (like a mirror),
  // while the underlying landmark coordinates stay in raw, unmirrored camera
  // space for gesture math and handedness classification.
  ctx.scale(-1, 1)
  ctx.translate(-canvas.width, 0)
  if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  for (const handData of hands) {
    drawSkeleton(ctx, canvas, handData)
    drawPinchIndicators(ctx, canvas, handData, thresholds)
  }
  ctx.restore()

  // Text must be drawn AFTER restoring the mirror transform, or it renders backwards.
  ctx.font = '700 15px "Space Grotesk", sans-serif'
  ctx.textAlign = 'center'
  for (const handData of hands) {
    const wrist = handData.landmarks[0]
    const x = canvas.width - wrist.x * canvas.width
    const y = wrist.y * canvas.height + 30
    ctx.fillStyle = DECK_COLOR[handData.hand]
    ctx.fillText(handData.hand === 'Left' ? 'DECK L' : 'DECK R', x, y)
  }
}

function drawSkeleton(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, handData: HandFrameData): void {
  const { landmarks } = handData
  const deckColor = DECK_COLOR[handData.hand]
  ctx.strokeStyle = hexToRgba(deckColor, 0.5)
  ctx.lineWidth = 1.5
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a]
    const pb = landmarks[b]
    if (!pa || !pb) continue
    ctx.beginPath()
    ctx.moveTo(pa.x * canvas.width, pa.y * canvas.height)
    ctx.lineTo(pb.x * canvas.width, pb.y * canvas.height)
    ctx.stroke()
  }
  landmarks.forEach((p, i) => {
    ctx.beginPath()
    ctx.fillStyle = i === 4 ? '#f5f5f5' : hexToRgba(deckColor, 0.85)
    ctx.arc(p.x * canvas.width, p.y * canvas.height, i === 4 ? 4 : 2.5, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawPinchIndicators(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  handData: HandFrameData,
  thresholds: ReturnType<typeof configFromSensitivity>,
): void {
  const thumb = handData.landmarks[4]
  if (!thumb) return
  const deckColor = DECK_COLOR[handData.hand]

  for (const finger of FINGERS) {
    const tip = handData.landmarks[FINGER_TIP_LANDMARK[finger]]
    const result = handData.gesture[finger]
    if (!tip || result.ratio === null) continue

    const midX = ((thumb.x + tip.x) / 2) * canvas.width
    const midY = ((thumb.y + tip.y) / 2) * canvas.height

    const nearThreshold = result.ratio < thresholds.exit * 1.15
    const color = result.isPinching ? deckColor : nearThreshold ? NEAR_THRESHOLD_COLOR : IDLE_DOT_COLOR

    // Threshold ring: radius encodes distance-to-threshold, like a rangefinder's
    // focus reticle tightening as the pinch closes in on the enter/exit gap.
    const ringRadius = result.isPinching ? 9 : 6 + Math.max(0, 1 - result.ratio) * 12
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.arc(midX, midY, ringRadius, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.fillStyle = color
    ctx.arc(midX, midY, result.isPinching ? 3 : 2, 0, Math.PI * 2)
    ctx.fill()

    if (result.isPinching) {
      // Reticle ticks at the ring's cardinal points - the "lock" cue.
      ctx.strokeStyle = '#f5f5f5'
      ctx.lineWidth = 1.5
      const tickLen = 4
      const tickGap = 3
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]) {
        ctx.beginPath()
        ctx.moveTo(midX + dx * (ringRadius + tickGap), midY + dy * (ringRadius + tickGap))
        ctx.lineTo(midX + dx * (ringRadius + tickGap + tickLen), midY + dy * (ringRadius + tickGap + tickLen))
        ctx.stroke()
      }
    }
  }
}
