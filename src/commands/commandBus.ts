import type { Handedness } from '../gesture/types'

/**
 * Semantic, hardware-agnostic command vocabulary. Gesture recognition (or,
 * later, a real Tact bracelet's sensors) emits these; the audio engine and
 * UI only ever consume them. Swapping the input layer never touches this
 * contract.
 */
export type CommandType =
  | 'PLAY_PAUSE'
  | 'VOLUME_UP_START'
  | 'VOLUME_UP_END'
  | 'VOLUME_DOWN_START'
  | 'VOLUME_DOWN_END'
  | 'REVERB_TOGGLE'
  | 'DELAY_TOGGLE'
  | 'DELAY_AMOUNT'
  | 'FILTER_CHANGE'
  | 'SPEED_CHANGE'

export interface FilterChangePayload {
  /** -1 (full low-pass) .. 0 (neutral) .. 1 (full high-pass) */
  value: number
  /** true when this update represents releasing back toward neutral. */
  released: boolean
}

export interface SpeedChangePayload {
  /** -1 (slowest) .. 0 (neutral) .. 1 (fastest), pre-mapping to playbackRate */
  value: number
  released: boolean
}

export interface CommandPayloadMap {
  PLAY_PAUSE: undefined
  VOLUME_UP_START: undefined
  VOLUME_UP_END: undefined
  VOLUME_DOWN_START: undefined
  VOLUME_DOWN_END: undefined
  REVERB_TOGGLE: undefined
  DELAY_TOGGLE: undefined
  DELAY_AMOUNT: { value: number }
  FILTER_CHANGE: FilterChangePayload
  SPEED_CHANGE: SpeedChangePayload
}

export type CommandSource = 'gesture' | 'simulation'

export interface Command<T extends CommandType = CommandType> {
  type: T
  payload: CommandPayloadMap[T]
  source: CommandSource
  hand?: Handedness
  timestamp: number
}

export type AnyCommand = { [K in CommandType]: Command<K> }[CommandType]

type Listener = (command: AnyCommand) => void

/** Minimal typed pub/sub so gesture input and simulation-mode input can both drive the audio engine identically. */
export class CommandBus {
  private listeners = new Set<Listener>()

  emit<T extends CommandType>(
    type: T,
    payload: CommandPayloadMap[T],
    meta: { source: CommandSource; hand?: Handedness; now: number },
  ): void {
    const command = { type, payload, source: meta.source, hand: meta.hand, timestamp: meta.now } as AnyCommand
    for (const listener of this.listeners) listener(command)
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
