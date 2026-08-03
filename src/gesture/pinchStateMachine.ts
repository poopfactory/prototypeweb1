/**
 * Pinch detection state machine for a single (hand, finger) pair.
 *
 * Guards against gesture false-positives using:
 *  - hysteresis (`enter` < `exit`, so a jittering ratio near one threshold
 *    can't rapid-fire transitions)
 *  - a minimum hold duration before a transition is confirmed
 *  - a cooldown between rising edges, to debounce toggle-style commands
 *  - graceful handling of missing per-frame data (hand briefly out of
 *    frame): state is held, not force-transitioned, until a longer
 *    "missing release" timeout elapses
 */
export interface PinchThresholds {
  /** Ratio must fall below this to begin a pinch. */
  enter: number
  /** Ratio must rise above this to release a pinch. Must be > enter. */
  exit: number
}

export interface PinchConfig extends PinchThresholds {
  minHoldMs: number
  cooldownMs: number
  missingReleaseMs: number
}

export const DEFAULT_PINCH_CONFIG: PinchConfig = {
  enter: 0.35,
  exit: 0.5,
  minHoldMs: 60,
  cooldownMs: 250,
  missingReleaseMs: 400,
}

/** Maps a 0..1 UI sensitivity slider to pinch thresholds. Higher = easier to trigger. */
export function configFromSensitivity(
  sensitivity: number,
  base: PinchConfig = DEFAULT_PINCH_CONFIG,
): PinchConfig {
  const clamped = Math.min(1, Math.max(0, sensitivity))
  const enter = 0.22 + clamped * 0.28
  const exit = enter + 0.15
  return { ...base, enter, exit }
}

export interface PinchResult {
  isPinching: boolean
  /** True exactly once, on the frame a pinch is confirmed to have started (rising edge). */
  justEntered: boolean
  /** True exactly once, on the frame a pinch is confirmed to have ended. */
  justExited: boolean
  heldMs: number
  ratio: number | null
  /** True when this result came from held/frozen state because the hand was briefly not detected. */
  isStale: boolean
}

const FROZEN = (isPinching: boolean, ratio: number | null = null): PinchResult => ({
  isPinching,
  justEntered: false,
  justExited: false,
  heldMs: 0,
  ratio,
  isStale: false,
})

export class PinchStateMachine {
  private config: PinchConfig
  private isPinchingState = false
  private candidateTarget: boolean | null = null
  private candidateSince = 0
  private pinchStartedAt = 0
  private lastRisingEdgeAt = -Infinity
  private lastSeenAt = 0
  private hasSeenData = false

  constructor(config: PinchConfig = DEFAULT_PINCH_CONFIG) {
    this.config = config
  }

  setConfig(config: PinchConfig): void {
    this.config = config
  }

  get pinching(): boolean {
    return this.isPinchingState
  }

  update(ratio: number | null, now: number): PinchResult {
    if (ratio === null) return this.updateMissing(now)

    this.lastSeenAt = now
    this.hasSeenData = true

    const target = this.isPinchingState ? ratio < this.config.exit : ratio < this.config.enter

    if (target === this.isPinchingState) {
      this.candidateTarget = null
      return {
        ...FROZEN(this.isPinchingState, ratio),
        heldMs: this.isPinchingState ? now - this.pinchStartedAt : 0,
      }
    }

    if (this.candidateTarget !== target) {
      this.candidateTarget = target
      this.candidateSince = now
    }

    if (now - this.candidateSince < this.config.minHoldMs) {
      return { ...FROZEN(this.isPinchingState, ratio), heldMs: this.isPinchingState ? now - this.pinchStartedAt : 0 }
    }

    return this.confirmTransition(target, now, ratio, false)
  }

  private confirmTransition(target: boolean, now: number, ratio: number | null, isStale: boolean): PinchResult {
    this.candidateTarget = null

    if (target && !this.isPinchingState) {
      if (now - this.lastRisingEdgeAt < this.config.cooldownMs) {
        // Debounced: too soon after the last toggle, ignore this rising edge.
        return { ...FROZEN(false, ratio), isStale }
      }
      this.isPinchingState = true
      this.pinchStartedAt = now
      this.lastRisingEdgeAt = now
      return { isPinching: true, justEntered: true, justExited: false, heldMs: 0, ratio, isStale }
    }

    if (!target && this.isPinchingState) {
      this.isPinchingState = false
      const heldMs = now - this.pinchStartedAt
      return { isPinching: false, justEntered: false, justExited: true, heldMs, ratio, isStale }
    }

    return { ...FROZEN(this.isPinchingState, ratio), isStale }
  }

  private updateMissing(now: number): PinchResult {
    if (!this.hasSeenData) return { ...FROZEN(false), isStale: true }

    const missingFor = now - this.lastSeenAt
    if (this.isPinchingState && missingFor >= this.config.missingReleaseMs) {
      this.isPinchingState = false
      this.candidateTarget = null
      return { isPinching: false, justEntered: false, justExited: true, heldMs: 0, ratio: null, isStale: true }
    }

    // Hold last known state so continuous parameters (volume, wet mix, etc.)
    // freeze instead of jumping while the hand is briefly out of frame.
    return {
      ...FROZEN(this.isPinchingState),
      heldMs: this.isPinchingState ? now - this.pinchStartedAt : 0,
      isStale: true,
    }
  }
}
