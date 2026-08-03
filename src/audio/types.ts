export interface ReverbState {
  enabled: boolean
  wet: number
}

export interface DelayState {
  enabled: boolean
  wet: number
}

export interface FilterState {
  /** -1 (full low-pass) .. 0 (neutral) .. 1 (full high-pass), as last commanded. */
  value: number
  type: BiquadFilterType
  frequency: number
}

export interface SpeedState {
  /** Actual, currently-applied playbackRate (smoothed toward the target each tick). */
  rate: number
}

export interface AdaptiveState {
  enabled: boolean
  loudness: number
  bassEnergy: number
  complexity: number
  wetCeiling: number
  gainCompensation: number
}

export type SourceMode = 'file' | 'demo' | 'none'

export interface EngineState {
  contextState: AudioContextState
  sourceMode: SourceMode
  fileName: string | null
  isPlaying: boolean
  currentTime: number
  duration: number
  /** Master output level 0..1 - shared by the left-hand gesture ramp and the bottom-bar slider. */
  volume: number
  reverb: ReverbState
  delay: DelayState
  filter: FilterState
  speed: SpeedState
  adaptive: AdaptiveState
  lastFeedback: { message: string; at: number } | null
}
