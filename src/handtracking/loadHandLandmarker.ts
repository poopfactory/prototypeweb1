import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const TASKS_VISION_VERSION = '1.0.1'
const WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarkerPromise: Promise<HandLandmarker> | null = null

/**
 * Loads the MediaPipe HandLandmarker task once and caches the promise.
 * Requires network access on first load (wasm runtime + model weights are
 * fetched from Google/jsDelivr CDNs and cached by the browser); the camera
 * frames themselves are never uploaded anywhere - detection runs fully
 * on-device after this one-time download.
 */
export function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).then((vision) =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }),
    )
  }
  return landmarkerPromise
}
