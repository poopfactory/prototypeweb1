import { clamp, lerp } from '../shared/math'
import type { AdaptiveState } from './types'

/**
 * "AI Adaptive Simulation" - NOT a trained model. It reads AnalyserNode data
 * from the pre-effect signal and the final output, and uses a small set of
 * hand-tuned heuristics to keep effects from feeling too aggressive on loud
 * or bass-heavy material, and to keep the perceived output level roughly
 * consistent as effects turn on and off. All corrections are smoothed
 * frame-to-frame so nothing snaps.
 */
export class AdaptiveAudioProcessor {
  private enabled = false
  private freqData: Uint8Array<ArrayBuffer>
  private timeData: Uint8Array<ArrayBuffer>
  private outTimeData: Uint8Array<ArrayBuffer>

  private state: Omit<AdaptiveState, 'enabled'> = {
    loudness: 0,
    bassEnergy: 0,
    complexity: 0,
    wetCeiling: 1,
    gainCompensation: 1,
  }

  private readonly sourceAnalyser: AnalyserNode
  private readonly outputAnalyser: AnalyserNode

  constructor(sourceAnalyser: AnalyserNode, outputAnalyser: AnalyserNode) {
    this.sourceAnalyser = sourceAnalyser
    this.outputAnalyser = outputAnalyser
    this.freqData = new Uint8Array(sourceAnalyser.frequencyBinCount)
    this.timeData = new Uint8Array(sourceAnalyser.fftSize)
    this.outTimeData = new Uint8Array(outputAnalyser.fftSize)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** Read-only snapshot of the last computed telemetry, without re-running analysis. */
  getSnapshot(): AdaptiveState {
    return { ...this.state, enabled: this.enabled }
  }

  /** Recomputes telemetry and smoothed correction factors. Call once per animation frame. */
  process(): AdaptiveState {
    if (!this.enabled) {
      // Relax back toward "no correction" so re-enabling doesn't start from a stale extreme.
      this.state = {
        loudness: lerp(this.state.loudness, 0, 0.08),
        bassEnergy: lerp(this.state.bassEnergy, 0, 0.08),
        complexity: lerp(this.state.complexity, 0, 0.08),
        wetCeiling: lerp(this.state.wetCeiling, 1, 0.08),
        gainCompensation: lerp(this.state.gainCompensation, 1, 0.08),
      }
      return { ...this.state, enabled: false }
    }

    this.sourceAnalyser.getByteTimeDomainData(this.timeData)
    this.sourceAnalyser.getByteFrequencyData(this.freqData)

    const loudness = clamp(rms(this.timeData) * 2.2, 0, 1)

    const bassBinCount = Math.max(1, Math.floor(this.freqData.length * 0.1))
    let bassSum = 0
    for (let i = 0; i < bassBinCount; i++) bassSum += this.freqData[i]
    const bassEnergy = clamp(bassSum / bassBinCount / 255, 0, 1)

    let total = 0
    let peak = 1
    for (let i = 0; i < this.freqData.length; i++) {
      total += this.freqData[i]
      if (this.freqData[i] > peak) peak = this.freqData[i]
    }
    const mean = total / this.freqData.length
    // Flatness proxy: energy spread evenly across bins (mean close to peak) reads as "complex" mix.
    const complexity = clamp(mean / peak, 0, 1)

    const targetCeiling = clamp(1 - loudness * 0.4 - complexity * 0.3 - bassEnergy * 0.25, 0.25, 1)

    this.outputAnalyser.getByteTimeDomainData(this.outTimeData)
    const outputLoudness = rms(this.outTimeData) * 2.2
    const targetGainComp = outputLoudness > 0.02 ? clamp(loudness / outputLoudness, 0.6, 1.3) : 1

    const smoothing = 0.12
    this.state = {
      loudness,
      bassEnergy,
      complexity,
      wetCeiling: lerp(this.state.wetCeiling, targetCeiling, smoothing),
      gainCompensation: lerp(this.state.gainCompensation, targetGainComp, smoothing),
    }
    return { ...this.state, enabled: true }
  }
}

function rms(data: Uint8Array): number {
  let sumSquares = 0
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128
    sumSquares += v * v
  }
  return Math.sqrt(sumSquares / data.length)
}
