import { describe, expect, it } from 'vitest'
import { DEFAULT_PINCH_CONFIG, PinchStateMachine, configFromSensitivity } from './pinchStateMachine'

const CFG = { ...DEFAULT_PINCH_CONFIG, minHoldMs: 50, cooldownMs: 100, missingReleaseMs: 200 }

describe('PinchStateMachine', () => {
  it('stays released while ratio is above the enter threshold', () => {
    const sm = new PinchStateMachine(CFG)
    const r = sm.update(0.9, 0)
    expect(r.isPinching).toBe(false)
    expect(r.justEntered).toBe(false)
  })

  it('requires the ratio to hold below the enter threshold for minHoldMs before confirming a pinch', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    let r = sm.update(0.1, 10) // dips below enter, but not held long enough
    expect(r.isPinching).toBe(false)
    r = sm.update(0.1, 30) // still short of 50ms
    expect(r.isPinching).toBe(false)
    r = sm.update(0.1, 65) // now >= 50ms since candidate started at t=10
    expect(r.isPinching).toBe(true)
    expect(r.justEntered).toBe(true)
  })

  it('does not repeat justEntered while the pinch is held (rising-edge only)', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    sm.update(0.1, 10)
    const entered = sm.update(0.1, 65)
    expect(entered.justEntered).toBe(true)

    for (let t = 70; t < 500; t += 20) {
      const r = sm.update(0.1, t)
      expect(r.justEntered).toBe(false)
      expect(r.isPinching).toBe(true)
    }
  })

  it('uses hysteresis: does not release until ratio exceeds the (higher) exit threshold', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    sm.update(0.1, 10)
    sm.update(0.1, 65) // pinched, enter=0.35 exit=0.5

    // ratio rises above enter but stays below exit -> should remain pinched
    let r = sm.update(0.4, 100)
    expect(r.isPinching).toBe(true)

    r = sm.update(0.6, 110)
    r = sm.update(0.6, 170) // held for minHoldMs above exit threshold
    expect(r.isPinching).toBe(false)
    expect(r.justExited).toBe(true)
  })

  it('does not flicker for a brief noise spike back above enter before minHoldMs elapses', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    sm.update(0.1, 10)
    sm.update(0.1, 65) // pinched

    // brief noisy spike toward exit, then back down before minHoldMs
    let r = sm.update(0.6, 70)
    expect(r.isPinching).toBe(true)
    r = sm.update(0.1, 80) // reverses before 50ms hold elapsed
    expect(r.isPinching).toBe(true)
    expect(r.justExited).toBe(false)
  })

  it('debounces rapid re-entry with a cooldown after a toggle fires', () => {
    const cfg = { ...DEFAULT_PINCH_CONFIG, minHoldMs: 20, cooldownMs: 100, missingReleaseMs: 200 }
    const sm = new PinchStateMachine(cfg)
    sm.update(0.9, 0)
    sm.update(0.1, 0)
    let r = sm.update(0.1, 20) // rising edge at t=20
    expect(r.justEntered).toBe(true)

    sm.update(0.9, 20)
    r = sm.update(0.9, 40) // falling edge at t=40
    expect(r.justExited).toBe(true)

    // quick re-pinch attempt, well within the 100ms cooldown window from t=20
    sm.update(0.1, 40)
    r = sm.update(0.1, 60)
    expect(r.isPinching).toBe(false) // suppressed by cooldown

    // after the cooldown has fully elapsed, a fresh pinch should succeed
    sm.update(0.9, 150)
    sm.update(0.1, 150)
    r = sm.update(0.1, 175)
    expect(r.isPinching).toBe(true)
    expect(r.justEntered).toBe(true)
  })

  it('holds state (does not release) for brief missing-hand frames, then force-releases after the timeout', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    sm.update(0.1, 0)
    sm.update(0.1, 50) // pinched

    let r = sm.update(null, 100) // hand briefly not detected
    expect(r.isPinching).toBe(true)
    expect(r.isStale).toBe(true)
    expect(r.justExited).toBe(false)

    r = sm.update(null, 150)
    expect(r.isPinching).toBe(true) // still within missingReleaseMs (200)

    r = sm.update(null, 260) // now beyond missingReleaseMs since last seen (t=50)
    expect(r.isPinching).toBe(false)
    expect(r.justExited).toBe(true)
  })

  it('never reports pinching before any data has been seen', () => {
    const sm = new PinchStateMachine(CFG)
    const r = sm.update(null, 0)
    expect(r.isPinching).toBe(false)
  })

  it('resumes correctly once the hand reappears after a brief absence', () => {
    const sm = new PinchStateMachine(CFG)
    sm.update(0.9, 0)
    sm.update(0.1, 0)
    sm.update(0.1, 50) // pinched
    sm.update(null, 100) // briefly missing
    const r = sm.update(0.1, 120) // reappears, still pinched
    expect(r.isPinching).toBe(true)
    expect(r.justEntered).toBe(false)
  })
})

describe('configFromSensitivity', () => {
  it('produces a valid enter < exit ordering across the sensitivity range', () => {
    for (let s = 0; s <= 1; s += 0.1) {
      const cfg = configFromSensitivity(s)
      expect(cfg.enter).toBeLessThan(cfg.exit)
    }
  })

  it('makes pinching easier to trigger (larger enter threshold) at higher sensitivity', () => {
    const low = configFromSensitivity(0)
    const high = configFromSensitivity(1)
    expect(high.enter).toBeGreaterThan(low.enter)
  })

  it('clamps out-of-range sensitivity values', () => {
    const belowRange = configFromSensitivity(-5)
    const aboveRange = configFromSensitivity(5)
    expect(belowRange).toEqual(configFromSensitivity(0))
    expect(aboveRange).toEqual(configFromSensitivity(1))
  })
})
