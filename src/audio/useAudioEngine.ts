import { useEffect, useRef, useState } from 'react'
import type { CommandBus } from '../commands/commandBus'
import { AudioEngine } from './AudioEngine'
import type { EngineState } from './types'

/**
 * Creates a single AudioEngine bound to the given CommandBus, runs its
 * per-frame tick loop, and mirrors its state into React so components can
 * render without reaching into the engine directly.
 */
export function useAudioEngine(bus: CommandBus): { engine: AudioEngine; state: EngineState } {
  const engineRef = useRef<AudioEngine | null>(null)
  if (!engineRef.current) engineRef.current = new AudioEngine(bus)
  const engine = engineRef.current

  const [state, setState] = useState<EngineState>(() => engine.getState())

  useEffect(() => engine.subscribe(setState), [engine])

  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      engine.tick(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  useEffect(() => () => engine.dispose(), [engine])

  return { engine, state }
}
