// Shared types for hand tracking + gesture recognition.
// A Landmark mirrors MediaPipe's normalized landmark shape so this module
// never needs to import the MediaPipe types directly (keeps it testable
// with plain fake data, and swappable for a real bracelet's sensor stream).
export interface Landmark {
  x: number
  y: number
  z: number
}

export type Handedness = 'Left' | 'Right'

export interface TrackedHand {
  handedness: Handedness
  landmarks: Landmark[]
  score: number
}

export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
} as const

export type FingerId = 'index' | 'middle' | 'ring' | 'pinky'

export const FINGER_TIP_LANDMARK: Record<FingerId, number> = {
  index: LANDMARK.INDEX_TIP,
  middle: LANDMARK.MIDDLE_TIP,
  ring: LANDMARK.RING_TIP,
  pinky: LANDMARK.PINKY_TIP,
}

export const FINGERS: FingerId[] = ['index', 'middle', 'ring', 'pinky']
