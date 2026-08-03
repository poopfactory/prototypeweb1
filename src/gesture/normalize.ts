import { FINGER_TIP_LANDMARK, LANDMARK, type FingerId, type Landmark } from './types'

export function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Reference size of the hand in the current frame, used to normalize
 * pinch distances so they stay roughly constant regardless of how far
 * the hand is from the camera. Wrist -> middle-finger-MCP is stable
 * across finger poses (unlike e.g. thumb-to-pinky span).
 */
export function palmSize(landmarks: Landmark[]): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const middleMcp = landmarks[LANDMARK.MIDDLE_MCP]
  if (!wrist || !middleMcp) return 0
  return distance(wrist, middleMcp)
}

/**
 * Distance between the thumb tip and a given fingertip, normalized by
 * palm size. Returns null if the palm size is degenerate (hand edge-on
 * to the camera, or missing landmarks) since dividing by it would blow
 * up into a false pinch.
 */
export function normalizedPinchDistance(landmarks: Landmark[], finger: FingerId): number | null {
  const thumb = landmarks[LANDMARK.THUMB_TIP]
  const tip = landmarks[FINGER_TIP_LANDMARK[finger]]
  const palm = palmSize(landmarks)
  if (!thumb || !tip || palm < 1e-6) return null
  return distance(thumb, tip) / palm
}

/**
 * Rolling moving-average smoother for a sequence of same-length landmark
 * arrays. Reduces per-frame jitter from the hand tracker before distances
 * or gesture deltas are computed from the points.
 */
export class LandmarkSmoother {
  private frames: Landmark[][] = []
  private readonly windowSize: number
  constructor(windowSize = 4) {
    this.windowSize = windowSize
  }

  push(landmarks: Landmark[]): Landmark[] {
    this.frames.push(landmarks)
    if (this.frames.length > this.windowSize) this.frames.shift()
    return this.smoothed()
  }

  reset(): void {
    this.frames = []
  }

  private smoothed(): Landmark[] {
    const count = this.frames.length
    const pointCount = this.frames[count - 1].length
    const out: Landmark[] = new Array(pointCount)
    for (let i = 0; i < pointCount; i++) {
      let x = 0
      let y = 0
      let z = 0
      let n = 0
      for (const frame of this.frames) {
        const p = frame[i]
        if (!p) continue
        x += p.x
        y += p.y
        z += p.z
        n++
      }
      out[i] = n > 0 ? { x: x / n, y: y / n, z: z / n } : { x: 0, y: 0, z: 0 }
    }
    return out
  }
}
