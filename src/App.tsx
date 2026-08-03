import { useRef } from 'react'
import './App.css'
import { CommandBus } from './commands/commandBus'
import { useAudioEngine } from './audio/useAudioEngine'
import { useAppStore } from './state/useAppStore'
import { TopBar } from './components/TopBar'
import { CameraView } from './components/CameraView'
import { KineticArt } from './components/KineticArt'
import { LeftControlPanel } from './components/LeftControlPanel'
import { RightEffectPanel } from './components/RightEffectPanel'
import { BottomBar } from './components/BottomBar'
import { Tutorial } from './components/Tutorial'
import { SimulationControls } from './components/SimulationControls'
import { FeedbackToast } from './components/FeedbackToast'

function App() {
  const busRef = useRef<CommandBus | null>(null)
  if (!busRef.current) busRef.current = new CommandBus()
  const bus = busRef.current

  const { engine, state: engineState } = useAudioEngine(bus)

  const handFrame = useAppStore((s) => s.handFrame)
  const simulationPanelOpen = useAppStore((s) => s.simulationPanelOpen)
  const openTutorial = useAppStore((s) => s.openTutorial)

  const leftGesture = handFrame?.hands.find((h) => h.hand === 'Left')?.gesture ?? null
  const rightGesture = handFrame?.hands.find((h) => h.hand === 'Right')?.gesture ?? null

  return (
    <div className="app">
      <TopBar engineState={engineState} onOpenTutorial={openTutorial} />

      {simulationPanelOpen && <SimulationControls bus={bus} />}

      <main className="app__main">
        <LeftControlPanel bus={bus} engineState={engineState} gesture={leftGesture} />

        <div className="app__stage">
          <KineticArt engine={engine} engineState={engineState} />
          <FeedbackToast feedback={engineState.lastFeedback} />
        </div>

        <RightEffectPanel bus={bus} engineState={engineState} gesture={rightGesture} />
      </main>

      <BottomBar engine={engine} engineState={engineState} />

      <CameraView bus={bus} />

      <Tutorial />
    </div>
  )
}

export default App
