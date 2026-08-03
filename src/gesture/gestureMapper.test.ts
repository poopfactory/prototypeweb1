import { describe, expect, it } from 'vitest'
import { CommandBus, type AnyCommand } from '../commands/commandBus'
import { HandGestureController } from './gestureMapper'
import { DEFAULT_PINCH_CONFIG } from './pinchStateMachine'
import type { Landmark } from './types'

const CFG = { ...DEFAULT_PINCH_CONFIG, minHoldMs: 20, cooldownMs: 50, missingReleaseMs: 200 }

/** Builds a 21-point hand with the thumb near a target fingertip and the rest neutral. */
function handWithPinch(pinchedFinger: 'index' | 'middle' | 'ring' | 'pinky' | null, fingerY = 0): Landmark[] {
  const base: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  base[0] = { x: 0.5, y: 0.7, z: 0 } // wrist
  base[9] = { x: 0.5, y: 0.5, z: 0 } // middle mcp -> palm size 0.2
  const tips: Record<string, number> = { index: 8, middle: 12, ring: 16, pinky: 20 }
  const far = { x: 0.9, y: 0.5, z: 0 }
  for (const f of Object.values(tips)) base[f] = far
  base[4] = { x: 0.1, y: 0.5, z: 0 } // thumb tip, far from every fingertip -> no pinch by default

  if (pinchedFinger) {
    const y = 0.5 + fingerY
    base[4] = { x: 0.5, y, z: 0 } // thumb tip touches the pinched finger
    base[tips[pinchedFinger]] = { x: 0.5, y, z: 0 }
  }
  return base
}

/**
 * Like handWithPinch, but for simulating "opening the pinch in place": the
 * thumb spreads away in X only, keeping the same Y as the pinch that just
 * ended, so the thumb+fingertip midpoint stays continuous instead of
 * teleporting to a neutral pose (which handWithPinch(null) does, and a
 * real hand never would).
 */
function handReleasingInPlace(finger: 'ring' | 'pinky', fingerY: number): Landmark[] {
  const base = handWithPinch(finger, fingerY)
  const y = 0.5 + fingerY
  base[4] = { x: 0.1, y, z: 0 } // thumb moves away in X, Y unchanged
  return base
}

function collect(bus: CommandBus): AnyCommand[] {
  const log: AnyCommand[] = []
  bus.subscribe((c) => log.push(c))
  return log
}

describe('HandGestureController - left hand', () => {
  it('toggles PLAY_PAUSE once on rising edge and not again while held', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Left', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('index'), 0)
    controller.update(handWithPinch('index'), 25) // confirms after minHoldMs

    for (let t = 30; t < 300; t += 20) controller.update(handWithPinch('index'), t)

    const playPauseCommands = log.filter((c) => c.type === 'PLAY_PAUSE')
    expect(playPauseCommands).toHaveLength(1)
  })

  it('emits VOLUME_UP_START / VOLUME_UP_END around a middle-finger pinch', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Left', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('middle'), 0)
    controller.update(handWithPinch('middle'), 25)
    expect(log.some((c) => c.type === 'VOLUME_UP_START')).toBe(true)

    controller.update(handWithPinch(null), 30)
    controller.update(handWithPinch(null), 100) // released
    expect(log.some((c) => c.type === 'VOLUME_UP_END')).toBe(true)
  })

  it('does not map the pinky finger to any command', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Left', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('pinky'), 0)
    controller.update(handWithPinch('pinky'), 25)

    expect(log).toHaveLength(0)
  })
})

describe('HandGestureController - right hand', () => {
  it('toggles REVERB_TOGGLE on index pinch rising edge', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('index'), 0)
    controller.update(handWithPinch('index'), 25)

    expect(log.filter((c) => c.type === 'REVERB_TOGGLE')).toHaveLength(1)
  })

  it('maps left vs right hand independently for the same landmark shape (no L/R crosstalk)', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const left = new HandGestureController('Left', bus, CFG)
    const right = new HandGestureController('Right', bus, CFG)

    left.update(handWithPinch(null), 0)
    right.update(handWithPinch(null), 0)
    left.update(handWithPinch('index'), 0)
    right.update(handWithPinch('index'), 0)
    left.update(handWithPinch('index'), 25)
    right.update(handWithPinch('index'), 25)

    expect(log.filter((c) => c.type === 'PLAY_PAUSE')).toHaveLength(1)
    expect(log.filter((c) => c.type === 'REVERB_TOGGLE')).toHaveLength(1)
  })

  it('reports a neutral FILTER_CHANGE within the dead zone near the pinch baseline (pinky finger)', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('pinky', 0), 0)
    controller.update(handWithPinch('pinky', 0), 25) // baseline captured here
    controller.update(handWithPinch('pinky', 0.01), 45) // tiny movement, within dead zone

    const filterCommands = log.filter((c) => c.type === 'FILTER_CHANGE')
    expect(filterCommands.length).toBeGreaterThan(0)
    const last = filterCommands[filterCommands.length - 1]
    expect(last.type === 'FILTER_CHANGE' && last.payload.value).toBe(0)
  })

  it('maps upward movement to a positive (high-pass) FILTER_CHANGE value beyond the dead zone (pinky finger)', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('pinky', 0), 0)
    controller.update(handWithPinch('pinky', 0), 25) // baseline at y=0.5
    controller.update(handWithPinch('pinky', -0.15), 45) // moved up (smaller y)

    const filterCommands = log.filter((c) => c.type === 'FILTER_CHANGE')
    const last = filterCommands[filterCommands.length - 1]
    expect(last.type === 'FILTER_CHANGE' && last.payload.value).toBeGreaterThan(0)
  })

  it('holds FILTER_CHANGE at its last value when the pinch ends, like Delay (no spring-back to neutral)', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('pinky', 0), 0)
    controller.update(handWithPinch('pinky', 0), 25)
    controller.update(handWithPinch('pinky', -0.2), 45)
    const filterCommands = log.filter((c) => c.type === 'FILTER_CHANGE')
    const heldValue = filterCommands[filterCommands.length - 1]
    const heldNumber = heldValue.type === 'FILTER_CHANGE' ? heldValue.payload.value : NaN

    controller.update(handReleasingInPlace('pinky', -0.2), 50)
    controller.update(handWithPinch(null), 70)
    controller.update(handWithPinch(null), 280) // past missingReleaseMs -> forced release

    const finalCommands = log.filter((c) => c.type === 'FILTER_CHANGE')
    const finalValue = finalCommands[finalCommands.length - 1]
    const finalNumber = finalValue.type === 'FILTER_CHANGE' ? finalValue.payload.value : NaN
    expect(finalNumber).toBeCloseTo(heldNumber, 2)
    expect(heldNumber).toBeGreaterThan(0)
  })

  it('continues a fresh FILTER_CHANGE pinch from the previously committed value instead of zero', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    // First pinch: move up, release, committing a positive value.
    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('pinky', 0), 0)
    controller.update(handWithPinch('pinky', 0), 25)
    controller.update(handWithPinch('pinky', -0.3), 45)
    const firstValue = log.filter((c) => c.type === 'FILTER_CHANGE').at(-1)
    const firstNumber = firstValue?.type === 'FILTER_CHANGE' ? firstValue.payload.value : NaN

    controller.update(handReleasingInPlace('pinky', -0.3), 70)
    controller.update(handWithPinch(null), 90)
    controller.update(handWithPinch(null), 280) // release

    // Second pinch: re-pinch and hold near the new baseline (inside dead zone) -
    // should report the previously committed value, not reset to 0.
    controller.update(handWithPinch('pinky', 0), 280)
    controller.update(handWithPinch('pinky', 0), 305)
    controller.update(handWithPinch('pinky', 0.01), 325)

    const afterRepinch = log.filter((c) => c.type === 'FILTER_CHANGE').at(-1)
    const afterNumber = afterRepinch?.type === 'FILTER_CHANGE' ? afterRepinch.payload.value : NaN
    expect(afterNumber).toBeCloseTo(firstNumber, 5)
  })

  it('maps upward movement to a positive SPEED_CHANGE value on the ring finger', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('ring', 0), 0)
    controller.update(handWithPinch('ring', 0), 25)
    controller.update(handWithPinch('ring', -0.15), 45)

    const speedCommands = log.filter((c) => c.type === 'SPEED_CHANGE')
    const last = speedCommands[speedCommands.length - 1]
    expect(last.type === 'SPEED_CHANGE' && last.payload.value).toBeGreaterThan(0)
  })

  it('freezes DELAY_AMOUNT while the hand briefly disappears instead of emitting stale/garbage values', () => {
    const bus = new CommandBus()
    const log = collect(bus)
    const controller = new HandGestureController('Right', bus, CFG)

    controller.update(handWithPinch(null), 0)
    controller.update(handWithPinch('middle'), 0)
    controller.update(handWithPinch('middle'), 25)
    const countBeforeLoss = log.filter((c) => c.type === 'DELAY_AMOUNT').length

    controller.update(null, 30) // hand briefly lost from the camera
    controller.update(null, 50)
    const countAfterLoss = log.filter((c) => c.type === 'DELAY_AMOUNT').length

    expect(countAfterLoss).toBe(countBeforeLoss) // no new DELAY_AMOUNT emitted while stale
  })
})
