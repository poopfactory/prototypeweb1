import type { CommandBus } from '../commands/commandBus'
import type { EngineState } from '../audio/types'
import type { GestureMapperState } from '../gesture/gestureMapper'
import { HoldButton } from './HoldButton'
import './SidePanel.css'

interface LeftControlPanelProps {
  bus: CommandBus
  engineState: EngineState
  gesture: GestureMapperState | null
}

export function LeftControlPanel({ bus, engineState, gesture }: LeftControlPanelProps) {
  const emit = (type: Parameters<CommandBus['emit']>[0], payload: never) =>
    bus.emit(type as never, payload, { source: 'simulation', hand: 'Left', now: performance.now() })

  const indexActive = !!gesture?.index.isPinching
  const middleActive = !!gesture?.middle.isPinching
  const ringActive = !!gesture?.ring.isPinching

  return (
    <section className="side-panel side-panel--left" aria-label="왼손 컨트롤 - 재생 및 볼륨">
      <h2 className="side-panel__title">
        <span className="side-panel__dot side-panel__dot--left" aria-hidden="true" />
        DECK L
        <span className="side-panel__subtitle">TRANSPORT</span>
      </h2>

      <div className={`gesture-card ${indexActive ? 'gesture-card--active' : ''}`}>
        <HoldButton
          className="gesture-card__button"
          label={engineState.isPlaying ? '⏸ Pause' : '▶ Play'}
          active={indexActive}
          onPress={() => {}}
          onRelease={() => emit('PLAY_PAUSE', undefined as never)}
        />
        <p className="gesture-card__hint">Thumb + Index · tap to toggle</p>
      </div>

      <div className={`gesture-card ${middleActive ? 'gesture-card--active' : ''}`}>
        <HoldButton
          className="gesture-card__button"
          label="Volume Up"
          pressedLabel="▲ Rising…"
          active={middleActive}
          onPress={() => emit('VOLUME_UP_START', undefined as never)}
          onRelease={() => emit('VOLUME_UP_END', undefined as never)}
        />
        <p className="gesture-card__hint">Thumb + Middle · hold</p>
      </div>

      <div className={`gesture-card ${ringActive ? 'gesture-card--active' : ''}`}>
        <HoldButton
          className="gesture-card__button"
          label="Volume Down"
          pressedLabel="▼ Falling…"
          active={ringActive}
          onPress={() => emit('VOLUME_DOWN_START', undefined as never)}
          onRelease={() => emit('VOLUME_DOWN_END', undefined as never)}
        />
        <p className="gesture-card__hint">Thumb + Ring · hold</p>
      </div>

      <div className="volume-gauge" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(engineState.volume * 100)} aria-label="현재 볼륨">
        <div className="volume-gauge__label">
          <span>VOL</span>
          <span className="volume-gauge__value">{Math.round(engineState.volume * 100)}</span>
        </div>
        <div className="volume-gauge__track">
          <div className="volume-gauge__ticks" aria-hidden="true" />
          <div className="volume-gauge__fill" style={{ width: `${engineState.volume * 100}%` }} />
        </div>
      </div>

      <p className="side-panel__note">PINKY — unassigned</p>
    </section>
  )
}
