import { useEffect } from 'react'
import type { CommandBus } from '../commands/commandBus'
import './SimulationControls.css'

interface SimulationControlsProps {
  bus: CommandBus
}

type KeyAction =
  | { kind: 'tap'; type: 'PLAY_PAUSE' | 'REVERB_TOGGLE' | 'DELAY_TOGGLE'; hand: 'Left' | 'Right' }
  | { kind: 'hold-start-end'; startType: string; endType: string; hand: 'Left' | 'Right' }
  | { kind: 'hold-value'; type: 'FILTER_CHANGE' | 'SPEED_CHANGE'; value: number; hand: 'Right' }

const KEYMAP: Record<string, KeyAction> = {
  '1': { kind: 'tap', type: 'PLAY_PAUSE', hand: 'Left' },
  '2': { kind: 'hold-start-end', startType: 'VOLUME_UP_START', endType: 'VOLUME_UP_END', hand: 'Left' },
  '3': { kind: 'hold-start-end', startType: 'VOLUME_DOWN_START', endType: 'VOLUME_DOWN_END', hand: 'Left' },
  q: { kind: 'tap', type: 'REVERB_TOGGLE', hand: 'Right' },
  w: { kind: 'tap', type: 'DELAY_TOGGLE', hand: 'Right' },
  e: { kind: 'hold-value', type: 'FILTER_CHANGE', value: 0.6, hand: 'Right' },
  r: { kind: 'hold-value', type: 'FILTER_CHANGE', value: -0.6, hand: 'Right' },
  t: { kind: 'hold-value', type: 'SPEED_CHANGE', value: 0.6, hand: 'Right' },
  g: { kind: 'hold-value', type: 'SPEED_CHANGE', value: -0.6, hand: 'Right' },
}

const LEGEND: { key: string; label: string }[] = [
  { key: '1', label: 'Play / Pause' },
  { key: '2 (hold)', label: 'Volume Up' },
  { key: '3 (hold)', label: 'Volume Down' },
  { key: 'Q', label: 'Reverb Toggle' },
  { key: 'W', label: 'Delay Toggle' },
  { key: 'T (tap)', label: 'Speed → Faster, stays set' },
  { key: 'G (tap)', label: 'Speed → Slower, stays set' },
  { key: 'E (tap)', label: 'Filter → High-pass, stays set' },
  { key: 'R (tap)', label: 'Filter → Low-pass, stays set' },
]

export function SimulationControls({ bus }: SimulationControlsProps) {
  useEffect(() => {
    const held = new Set<string>()

    const emit = (type: string, payload: unknown, hand: 'Left' | 'Right') =>
      bus.emit(type as never, payload as never, { source: 'simulation', hand, now: performance.now() })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      const key = e.key.toLowerCase()
      const action = KEYMAP[key]
      if (!action) return
      held.add(key)

      if (action.kind === 'tap') emit(action.type, undefined, action.hand)
      else if (action.kind === 'hold-start-end') emit(action.startType, undefined, action.hand)
      else emit(action.type, { value: action.value, released: false }, action.hand)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const action = KEYMAP[key]
      if (!action || !held.has(key)) return
      held.delete(key)

      // Filter/Speed are sticky like Delay - releasing the key leaves the
      // value exactly where it was, so there's nothing to emit here.
      if (action.kind === 'hold-start-end') emit(action.endType, undefined, action.hand)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [bus])

  return (
    <div className="sim-controls" role="region" aria-label="키보드 시뮬레이션 모드 안내">
      <p className="sim-controls__title">Keyboard Simulation Active — 카메라 없이도 아래 키로 모든 기능을 테스트할 수 있습니다.</p>
      <ul className="sim-controls__legend">
        {LEGEND.map((item) => (
          <li key={item.key}>
            <kbd>{item.key}</kbd>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
