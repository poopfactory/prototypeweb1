import type { EngineState } from '../audio/types'
import { useAppStore } from '../state/useAppStore'
import './TopBar.css'

interface TopBarProps {
  engineState: EngineState
  onOpenTutorial: () => void
}

type LedState = 'ok' | 'warn' | 'off'

function Led({ state, code, readout }: { state: LedState; code: string; readout?: string }) {
  return (
    <span className="led">
      <span className={`led__bulb led__bulb--${state}`} aria-hidden="true" />
      <span className="led__code">{code}</span>
      {readout && <span className="led__readout">{readout}</span>}
    </span>
  )
}

export function TopBar({ engineState, onOpenTutorial }: TopBarProps) {
  const cameraStatus = useAppStore((s) => s.cameraStatus)
  const trackerStatus = useAppStore((s) => s.trackerStatus)
  const fps = useAppStore((s) => s.fps)
  const cameraEnabled = useAppStore((s) => s.cameraEnabled)

  const cameraState: LedState = !cameraEnabled ? 'off' : cameraStatus === 'granted' ? 'ok' : cameraStatus === 'requesting' ? 'warn' : 'off'
  const audioState: LedState = engineState.contextState === 'running' ? 'ok' : engineState.contextState === 'suspended' ? 'warn' : 'off'
  const trackState: LedState = trackerStatus === 'ready' ? 'ok' : trackerStatus === 'loading' ? 'warn' : 'off'
  const aiState: LedState = engineState.adaptive.enabled ? 'ok' : 'off'

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">TACT</span>
        <span className="top-bar__model" aria-hidden="true">
          WC&#8209;1
        </span>
        <span className="top-bar__tagline">wrist-worn mix control</span>
      </div>

      <div className="top-bar__leds" role="status" aria-label="시스템 상태">
        <Led state={cameraState} code="CAM" />
        <Led state={audioState} code="AUD" />
        <Led state={aiState} code="AI" />
        <Led state={trackState} code="TRK" readout={trackState === 'ok' ? `${Math.round(fps)}fps` : undefined} />
      </div>

      <button type="button" className="top-bar__help" onClick={onOpenTutorial} aria-label="튜토리얼 다시 보기">
        HELP
      </button>
    </header>
  )
}
