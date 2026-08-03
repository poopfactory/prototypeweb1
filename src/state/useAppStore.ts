import { create } from 'zustand'
import type { FrameData } from '../handtracking/useHandTracking'

interface AppStore {
  sensitivity: number
  setSensitivity: (v: number) => void

  cameraEnabled: boolean
  setCameraEnabled: (v: boolean) => void

  tutorialOpen: boolean
  tutorialStep: number
  openTutorial: () => void
  closeTutorial: () => void
  setTutorialStep: (n: number) => void

  simulationPanelOpen: boolean
  setSimulationPanelOpen: (v: boolean) => void

  handFrame: FrameData | null
  setHandFrame: (f: FrameData) => void

  cameraStatus: string
  trackerStatus: string
  fps: number
  trackingErrorMessage: string | null
  setTrackingStatus: (s: { cameraStatus: string; trackerStatus: string; fps: number; errorMessage: string | null }) => void
}

export const useAppStore = create<AppStore>((set) => ({
  sensitivity: 0.5,
  setSensitivity: (v) => set({ sensitivity: v }),

  cameraEnabled: true,
  setCameraEnabled: (v) => set({ cameraEnabled: v }),

  tutorialOpen: true,
  tutorialStep: 0,
  openTutorial: () => set({ tutorialOpen: true, tutorialStep: 0 }),
  closeTutorial: () => set({ tutorialOpen: false }),
  setTutorialStep: (n) => set({ tutorialStep: n }),

  simulationPanelOpen: false,
  setSimulationPanelOpen: (v) => set({ simulationPanelOpen: v }),

  handFrame: null,
  setHandFrame: (f) => set({ handFrame: f }),

  cameraStatus: 'idle',
  trackerStatus: 'idle',
  fps: 0,
  trackingErrorMessage: null,
  setTrackingStatus: ({ cameraStatus, trackerStatus, fps, errorMessage }) =>
    set({ cameraStatus, trackerStatus, fps, trackingErrorMessage: errorMessage }),
}))
