import type { CommandBus, CommandSource } from '../commands/commandBus'
import { normalizedPinchDistance, palmSize } from './normalize'
import { DEFAULT_PINCH_CONFIG, PinchStateMachine, type PinchConfig, type PinchResult } from './pinchStateMachine'
import { FINGERS, FINGER_TIP_LANDMARK, LANDMARK, type FingerId, type Handedness, type Landmark } from './types'

/** Movement below this many palm-widths from the pinch-start baseline is ignored (dead zone). */
const FILTER_DEAD_ZONE = 0.15
const FILTER_MAX_RANGE = 1.3
const SPEED_DEAD_ZONE = 0.12
const SPEED_MAX_RANGE = 1.1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Maps a signed offset to -1..1 with a dead zone near the baseline and a saturating max range. */
function mapWithDeadZone(delta: number, deadZone: number, maxRange: number): number {
  const magnitude = Math.abs(delta)
  if (magnitude <= deadZone) return 0
  const t = clamp((magnitude - deadZone) / (maxRange - deadZone), 0, 1)
  return Math.sign(delta) * t
}

function fingertipMidpointY(landmarks: Landmark[], finger: FingerId): number {
  const thumb = landmarks[LANDMARK.THUMB_TIP]
  const tip = landmarks[FINGER_TIP_LANDMARK[finger]]
  return (thumb.y + tip.y) / 2
}

export interface GestureMapperState {
  /** Snapshot of each finger's pinch state, keyed by finger id, for UI display. */
  index: PinchResult
  middle: PinchResult
  ring: PinchResult
  pinky: PinchResult
}

/**
 * Owns the four per-finger pinch state machines for one hand and translates
 * confirmed pinch transitions + hand movement into semantic commands on the
 * shared CommandBus. Contains no audio or rendering logic.
 */
export class HandGestureController {
  private readonly pinches: Record<FingerId, PinchStateMachine>
  private readonly side: Handedness
  private readonly bus: CommandBus
  private filterBaselineY: number | null = null
  private speedBaselineY: number | null = null
  /**
   * Filter/Speed behave like Delay: a pinch-and-move adjusts the value,
   * releasing leaves it exactly where it was (no spring-back to neutral).
   * These track the last committed value so the next pinch's relative
   * movement is added on top of it instead of overwriting from zero.
   */
  private filterCommittedValue = 0
  private speedCommittedValue = 0
  private filterValueAtPinchStart = 0
  private speedValueAtPinchStart = 0

  constructor(side: Handedness, bus: CommandBus, config: PinchConfig = DEFAULT_PINCH_CONFIG) {
    this.side = side
    this.bus = bus
    this.pinches = {
      index: new PinchStateMachine(config),
      middle: new PinchStateMachine(config),
      ring: new PinchStateMachine(config),
      pinky: new PinchStateMachine(config),
    }
  }

  setSensitivity(config: PinchConfig): void {
    for (const finger of FINGERS) this.pinches[finger].setConfig(config)
  }

  /** `landmarks` is null when this hand is not currently detected in-frame. */
  update(landmarks: Landmark[] | null, now: number, source: CommandSource = 'gesture'): GestureMapperState {
    const palm = landmarks ? palmSize(landmarks) : 0
    const results = {} as GestureMapperState

    for (const finger of FINGERS) {
      const ratio = landmarks ? normalizedPinchDistance(landmarks, finger) : null
      const result = this.pinches[finger].update(ratio, now)
      results[finger] = result
      this.dispatch(finger, result, landmarks, palm, now, source)
    }

    return results
  }

  private dispatch(
    finger: FingerId,
    result: PinchResult,
    landmarks: Landmark[] | null,
    palm: number,
    now: number,
    source: CommandSource,
  ): void {
    if (this.side === 'Left') this.dispatchLeft(finger, result, now, source)
    else this.dispatchRight(finger, result, landmarks, palm, now, source)
  }

  private dispatchLeft(finger: FingerId, result: PinchResult, now: number, source: CommandSource): void {
    const emit = (type: Parameters<CommandBus['emit']>[0], payload: never) =>
      this.bus.emit(type as never, payload, { source, hand: this.side, now })

    switch (finger) {
      case 'index':
        if (result.justEntered) emit('PLAY_PAUSE', undefined as never)
        break
      case 'middle':
        if (result.justEntered) emit('VOLUME_UP_START', undefined as never)
        if (result.justExited) emit('VOLUME_UP_END', undefined as never)
        break
      case 'ring':
        if (result.justEntered) emit('VOLUME_DOWN_START', undefined as never)
        if (result.justExited) emit('VOLUME_DOWN_END', undefined as never)
        break
      case 'pinky':
        break // unused in this version
    }
  }

  private dispatchRight(
    finger: FingerId,
    result: PinchResult,
    landmarks: Landmark[] | null,
    palm: number,
    now: number,
    source: CommandSource,
  ): void {
    const emit = (type: Parameters<CommandBus['emit']>[0], payload: never) =>
      this.bus.emit(type as never, payload, { source, hand: this.side, now })

    switch (finger) {
      case 'index':
        if (result.justEntered) emit('REVERB_TOGGLE', undefined as never)
        break

      case 'middle': {
        if (result.justEntered) emit('DELAY_TOGGLE', undefined as never)
        if (result.isPinching && !result.isStale && landmarks) {
          const y = fingertipMidpointY(landmarks, 'middle')
          const wet = clamp(1 - y, 0, 1)
          emit('DELAY_AMOUNT', { value: wet } as never)
        }
        break
      }

      case 'ring': {
        // Pitch/Speed. Pinch-and-move adjusts it; releasing leaves it fixed
        // right where it was (same "set and let go" feel as Delay), rather
        // than springing back to 1.0x. The next pinch's movement is added
        // on top of that committed value, not measured from zero again.
        if (result.justEntered && landmarks) {
          this.speedBaselineY = fingertipMidpointY(landmarks, 'ring')
          this.speedValueAtPinchStart = this.speedCommittedValue
        }
        if (result.isPinching && !result.isStale && landmarks && this.speedBaselineY !== null && palm > 1e-6) {
          const y = fingertipMidpointY(landmarks, 'ring')
          const delta = (this.speedBaselineY - y) / palm
          const movement = mapWithDeadZone(delta, SPEED_DEAD_ZONE, SPEED_MAX_RANGE)
          const value = clamp(this.speedValueAtPinchStart + movement, -1, 1)
          this.speedCommittedValue = value
          emit('SPEED_CHANGE', { value, released: false } as never)
        }
        if (result.justExited) {
          this.speedBaselineY = null
        }
        break
      }

      case 'pinky': {
        // Filter. Same "set and let go" behavior as Pitch/Speed above.
        if (result.justEntered && landmarks) {
          this.filterBaselineY = fingertipMidpointY(landmarks, 'pinky')
          this.filterValueAtPinchStart = this.filterCommittedValue
        }
        if (result.isPinching && !result.isStale && landmarks && this.filterBaselineY !== null && palm > 1e-6) {
          const y = fingertipMidpointY(landmarks, 'pinky')
          const delta = (this.filterBaselineY - y) / palm // positive = moved up
          const movement = mapWithDeadZone(delta, FILTER_DEAD_ZONE, FILTER_MAX_RANGE)
          const value = clamp(this.filterValueAtPinchStart + movement, -1, 1)
          this.filterCommittedValue = value
          emit('FILTER_CHANGE', { value, released: false } as never)
        }
        if (result.justExited) {
          this.filterBaselineY = null
        }
        break
      }
    }
  }
}
