import { useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import { PRESET_TRACKS } from '../audio/presetTracks'
import type { EngineState } from '../audio/types'
import { useAppStore } from '../state/useAppStore'
import './BottomBar.css'

interface BottomBarProps {
  engine: AudioEngine
  engineState: EngineState
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function Switch({
  code,
  on,
  onClick,
  label,
}: {
  code: string
  on: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`deck-switch ${on ? 'deck-switch--on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
      aria-label={label ?? `${code} ${on ? 'On' : 'Off'}`}
    >
      <span className="deck-switch__code">{code}</span>
      <span className="deck-switch__paddle" aria-hidden="true" />
    </button>
  )
}

export function BottomBar({ engine, engineState }: BottomBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const sensitivity = useAppStore((s) => s.sensitivity)
  const setSensitivity = useAppStore((s) => s.setSensitivity)
  const cameraEnabled = useAppStore((s) => s.cameraEnabled)
  const setCameraEnabled = useAppStore((s) => s.setCameraEnabled)
  const simulationPanelOpen = useAppStore((s) => s.simulationPanelOpen)
  const setSimulationPanelOpen = useAppStore((s) => s.setSimulationPanelOpen)
  const adaptiveEnabled = engineState.adaptive.enabled
  // Derived from the engine's actual source, not separate UI state, so this
  // never drifts out of sync with what's really playing (e.g. when Play is
  // pressed with no file loaded and the engine falls back to the demo tone).
  const demoSignalEnabled = engineState.sourceMode === 'demo'

  const [loadingTrackId, setLoadingTrackId] = useState<string | null>(null)

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await engine.loadFile(file)
  }

  const onPresetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const track = PRESET_TRACKS.find((t) => t.id === e.target.value)
    if (!track) return
    setLoadingTrackId(track.id)
    try {
      await engine.loadUrl(track.url, track.artist ? `${track.artist} - ${track.title}` : track.title)
    } finally {
      setLoadingTrackId(null)
    }
  }

  const hasSource = engineState.sourceMode !== 'none'

  return (
    <footer className="bottom-bar">
      <div className="bottom-bar__row">
        <button type="button" className="bottom-bar__file" onClick={() => fileInputRef.current?.click()}>
          <span className="bottom-bar__file-label">FILE</span>
          <span className="bottom-bar__file-name">{engineState.fileName ?? 'no file selected'}</span>
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" hidden onChange={(e) => void onFileChange(e)} />

        <label className="bottom-bar__file bottom-bar__presets">
          <span className="bottom-bar__file-label">TRACKS</span>
          <select
            className="bottom-bar__presets-select"
            value=""
            onChange={(e) => void onPresetChange(e)}
            aria-label="미리 등록된 트랙 선택"
            disabled={loadingTrackId !== null}
          >
            <option value="" disabled>
              {loadingTrackId ? '불러오는 중…' : '트랙 선택'}
            </option>
            {PRESET_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.artist ? `${t.artist} - ${t.title}` : t.title}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="bottom-bar__transport"
          onClick={() => void engine.togglePlayPause()}
          disabled={!hasSource}
          aria-pressed={engineState.isPlaying}
          aria-label={engineState.isPlaying ? 'Pause' : 'Play'}
        >
          {engineState.isPlaying ? '❚❚' : '▶'}
        </button>

        <span className="bottom-bar__time">{formatTime(engineState.currentTime)}</span>
        <input
          type="range"
          className="bottom-bar__timeline"
          min={0}
          max={Math.max(engineState.duration, 0.001)}
          step={0.01}
          value={Math.min(engineState.currentTime, engineState.duration)}
          onChange={(e) => engine.seek(Number(e.target.value))}
          disabled={engineState.sourceMode !== 'file' || engineState.duration === 0}
          aria-label="재생 위치"
        />
        <span className="bottom-bar__time">{formatTime(engineState.duration)}</span>
      </div>

      <div className="bottom-bar__row">
        <label className="bottom-bar__control">
          <span>MASTER</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(engineState.volume * 100)}
            onChange={(e) => engine.setMasterVolume(Number(e.target.value) / 100)}
            aria-label="마스터 볼륨"
          />
        </label>

        <label className="bottom-bar__control">
          <span>SENS</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sensitivity * 100)}
            onChange={(e) => setSensitivity(Number(e.target.value) / 100)}
            aria-label="제스처 민감도"
          />
        </label>

        <div className="bottom-bar__switches">
          <Switch code="CAM" on={cameraEnabled} onClick={() => setCameraEnabled(!cameraEnabled)} label={`Camera ${cameraEnabled ? 'On' : 'Off'}`} />
          <Switch
            code="DEMO"
            on={demoSignalEnabled}
            onClick={() => engine.setDemoSignalEnabled(!demoSignalEnabled)}
            label={`Demo Signal ${demoSignalEnabled ? 'On' : 'Off'} - 오디오 파일 없이 이펙트를 테스트할 수 있는 데모 신호`}
          />
          <Switch code="AI" on={adaptiveEnabled} onClick={() => engine.setAdaptiveEnabled(!adaptiveEnabled)} label={`AI Adaptive Simulation ${adaptiveEnabled ? 'On' : 'Off'}`} />
          <Switch
            code="SIM"
            on={simulationPanelOpen}
            onClick={() => setSimulationPanelOpen(!simulationPanelOpen)}
            label={`Keyboard Simulation ${simulationPanelOpen ? 'On' : 'Off'}`}
          />
        </div>
      </div>

      {engineState.contextState === 'suspended' && (
        <button type="button" className="bottom-bar__resume-banner" onClick={() => void engine.resumeContext()}>
          오디오가 일시 정지되어 있습니다. 클릭하여 재개하세요.
        </button>
      )}

      <p className="bottom-bar__privacy">
        카메라 영상은 브라우저 안에서만 처리되며 저장되거나 전송되지 않습니다. 선택한 음원 파일도 로컬에서만 재생됩니다.
      </p>
    </footer>
  )
}
