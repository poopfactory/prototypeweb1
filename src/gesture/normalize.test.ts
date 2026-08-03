import { describe, expect, it } from 'vitest'
import { LandmarkSmoother, distance, normalizedPinchDistance, palmSize } from './normalize'
import type { Landmark } from './types'

function makeHand(overrides: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const base: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  base[0] = { x: 0, y: 0, z: 0 } // wrist
  base[9] = { x: 0, y: 0.2, z: 0 } // middle mcp -> palmSize 0.2
  base[4] = { x: 0.3, y: 0, z: 0 } // thumb tip
  base[8] = { x: 0.3, y: 0, z: 0 } // index tip (touching thumb)
  base[12] = { x: 1, y: 0, z: 0 } // middle tip (far)
  for (const [key, value] of Object.entries(overrides)) {
    if (value) base[Number(key)] = value
  }
  return base
}

describe('distance', () => {
  it('computes euclidean distance in 3d', () => {
    expect(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5)
  })
})

describe('palmSize', () => {
  it('measures wrist to middle-mcp distance', () => {
    const hand = makeHand()
    expect(palmSize(hand)).toBeCloseTo(0.2)
  })

  it('returns 0 for empty landmarks', () => {
    expect(palmSize([])).toBe(0)
  })
})

describe('normalizedPinchDistance', () => {
  it('returns near-zero ratio when thumb and finger tip touch', () => {
    const hand = makeHand()
    const ratio = normalizedPinchDistance(hand, 'index')
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeCloseTo(0, 5)
  })

  it('returns a larger ratio for a far fingertip', () => {
    const hand = makeHand()
    const ratio = normalizedPinchDistance(hand, 'middle')
    // distance(thumb(0.3,0), middle(1,0)) = 0.7, palm = 0.2 -> ratio 3.5
    expect(ratio!).toBeCloseTo(3.5)
  })

  it('is roughly invariant to hand distance from camera (uniform scale)', () => {
    const near = makeHand()
    const nearRatio = normalizedPinchDistance(near, 'middle')!

    const scale = 0.5
    const far = makeHand({
      9: { x: 0, y: 0.2 * scale, z: 0 },
      4: { x: 0.3 * scale, y: 0, z: 0 },
      12: { x: 1 * scale, y: 0, z: 0 },
    })
    const farRatio = normalizedPinchDistance(far, 'middle')!
    expect(farRatio).toBeCloseTo(nearRatio, 5)
  })

  it('returns null when palm size is degenerate', () => {
    const hand = makeHand({ 9: { x: 0, y: 0, z: 0 } })
    expect(normalizedPinchDistance(hand, 'index')).toBeNull()
  })
})

describe('LandmarkSmoother', () => {
  it('averages across the configured window', () => {
    const smoother = new LandmarkSmoother(3)
    smoother.push([{ x: 0, y: 0, z: 0 }])
    smoother.push([{ x: 2, y: 0, z: 0 }])
    const result = smoother.push([{ x: 4, y: 0, z: 0 }])
    expect(result[0].x).toBeCloseTo(2)
  })

  it('drops oldest frames beyond the window size', () => {
    const smoother = new LandmarkSmoother(2)
    smoother.push([{ x: 0, y: 0, z: 0 }])
    smoother.push([{ x: 10, y: 0, z: 0 }])
    const result = smoother.push([{ x: 20, y: 0, z: 0 }])
    // window of 2 -> average of last two pushes (10, 20) = 15
    expect(result[0].x).toBeCloseTo(15)
  })

  it('resets cleanly', () => {
    const smoother = new LandmarkSmoother(3)
    smoother.push([{ x: 100, y: 0, z: 0 }])
    smoother.reset()
    const result = smoother.push([{ x: 5, y: 0, z: 0 }])
    expect(result[0].x).toBeCloseTo(5)
  })
})
