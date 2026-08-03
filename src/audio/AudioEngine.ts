import type { AnyCommand, CommandBus } from '../commands/commandBus'
import { clamp, lerp } from '../shared/math'
import { AdaptiveAudioProcessor } from './AdaptiveAudio'
import { generateImpulseResponse } from './impulseResponse'
import type { EngineState, SourceMode } from './types'

const BASE_REVERB_WET = 0.42
const DEFAULT_DELAY_WET = 0.35
const DELAY_FEEDBACK = 0.34 // fixed, deliberately conservative to avoid runaway buildup
const DELAY_TIME_SECONDS = 0.32
const RAMP_TIME_CONSTANT = 0.08
const VOLUME_RAMP_PER_SECOND = 0.6
const SPEED_TRACK_RATE = 0.18 // per-tick lerp factor toward the target playbackRate

type VolumeRampDirection = 'up' | 'down' | null

function filterParamsFromValue(value: number): { type: BiquadFilterType; frequency: number } {
  if (value >= 0) {
    return { type: 'highpass', frequency: lerp(20, 6000, value) }
  }
  return { type: 'lowpass', frequency: lerp(20000, 400, -value) }
}

function rateFromSpeedValue(value: number): number {
  if (value >= 0) return lerp(1.0, 1.35, value)
  return lerp(1.0, 0.75, -value)
}

type Listener = (state: EngineState) => void

/**
 * Owns the entire Web Audio graph and translates semantic commands
 * (from gestures or the on-screen simulation controls - both look
 * identical here) into audio parameter changes. No hand-tracking or
 * React code lives in this file.
 */
export class AudioEngine {
  readonly context: AudioContext

  private readonly sourceGain: GainNode
  private readonly preAnalyser: AnalyserNode
  private readonly filterNode: BiquadFilterNode
  private readonly delayNode: DelayNode
  private readonly delayFeedback: GainNode
  private readonly delayWet: GainNode
  private readonly delayDry: GainNode
  private readonly postDelay: GainNode
  private readonly convolver: ConvolverNode
  private readonly reverbWet: GainNode
  private readonly reverbDry: GainNode
  private readonly postReverb: GainNode
  private readonly adaptiveGainComp: GainNode
  private readonly masterGain: GainNode
  private readonly limiter: DynamicsCompressorNode
  private readonly outputAnalyser: AnalyserNode

  private readonly fileSourceGain: GainNode
  private readonly demoSourceGain: GainNode
  private demoOscillators: { stop: () => void } | null = null

  private readonly adaptive: AdaptiveAudioProcessor

  private audioEl: HTMLAudioElement | null = null
  private mediaSource: MediaElementAudioSourceNode | null = null
  private objectUrl: string | null = null

  private sourceMode: SourceMode = 'none'
  private fileName: string | null = null
  // Explicit flag instead of inferring "is the demo tone playing" from
  // demoSourceGain's live AudioParam value: that value only *approaches*
  // its target asymptotically (setTargetAtTime never truly reaches 0), so
  // reading it right after pause() could still read above the threshold
  // and make Pause look like it silently failed for a fraction of a second.
  private demoPlaying = false

  private volume = 0.75
  private volumeRampDirection: VolumeRampDirection = null

  private reverbEnabled = false
  private delayEnabled = false
  private delayAmount = DEFAULT_DELAY_WET
  private filterValue = 0
  private speedTarget = 1
  private speedCurrent = 1

  private lastFeedback: { message: string; at: number } | null = null
  private lastTickAt: number | null = null

  private listeners = new Set<Listener>()
  private unsubscribeBus: () => void

  constructor(bus: CommandBus) {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.context = new AudioContextCtor()
    const ctx = this.context

    this.sourceGain = ctx.createGain()
    this.fileSourceGain = ctx.createGain()
    this.demoSourceGain = ctx.createGain()
    this.demoSourceGain.gain.value = 0

    this.preAnalyser = ctx.createAnalyser()
    this.preAnalyser.fftSize = 1024

    this.filterNode = ctx.createBiquadFilter()
    this.filterNode.type = 'highpass'
    this.filterNode.frequency.value = 20
    this.filterNode.Q.value = 0.6

    this.delayNode = ctx.createDelay(1.0)
    this.delayNode.delayTime.value = DELAY_TIME_SECONDS
    this.delayFeedback = ctx.createGain()
    this.delayFeedback.gain.value = DELAY_FEEDBACK
    this.delayWet = ctx.createGain()
    this.delayWet.gain.value = 0
    this.delayDry = ctx.createGain()
    this.delayDry.gain.value = 1
    this.postDelay = ctx.createGain()

    this.convolver = ctx.createConvolver()
    this.convolver.buffer = generateImpulseResponse(ctx)
    this.reverbWet = ctx.createGain()
    this.reverbWet.gain.value = 0
    this.reverbDry = ctx.createGain()
    this.reverbDry.gain.value = 1
    this.postReverb = ctx.createGain()

    this.adaptiveGainComp = ctx.createGain()
    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = this.volume

    this.limiter = ctx.createDynamicsCompressor()
    this.limiter.threshold.value = -10
    this.limiter.knee.value = 6
    this.limiter.ratio.value = 12
    this.limiter.attack.value = 0.003
    this.limiter.release.value = 0.25

    this.outputAnalyser = ctx.createAnalyser()
    this.outputAnalyser.fftSize = 1024

    // --- wire the graph ---
    this.fileSourceGain.connect(this.sourceGain)
    this.demoSourceGain.connect(this.sourceGain)

    this.sourceGain.connect(this.preAnalyser)
    this.preAnalyser.connect(this.filterNode)

    this.filterNode.connect(this.delayDry)
    this.filterNode.connect(this.delayNode)
    this.delayNode.connect(this.delayFeedback)
    this.delayFeedback.connect(this.delayNode)
    this.delayNode.connect(this.delayWet)
    this.delayDry.connect(this.postDelay)
    this.delayWet.connect(this.postDelay)

    this.postDelay.connect(this.reverbDry)
    this.postDelay.connect(this.convolver)
    this.convolver.connect(this.reverbWet)
    this.reverbDry.connect(this.postReverb)
    this.reverbWet.connect(this.postReverb)

    this.postReverb.connect(this.adaptiveGainComp)
    this.adaptiveGainComp.connect(this.masterGain)
    this.masterGain.connect(this.limiter)
    this.limiter.connect(this.outputAnalyser)
    this.outputAnalyser.connect(ctx.destination)

    this.adaptive = new AdaptiveAudioProcessor(this.preAnalyser, this.outputAnalyser)

    this.unsubscribeBus = bus.subscribe((command) => this.handleCommand(command))
    this.startDemoOscillators()
  }

  // ---------- public API ----------

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  /** Bin count for arrays passed to getFrequencyData/getWaveformData. */
  get visualizerBinCount(): number {
    return this.outputAnalyser.frequencyBinCount
  }

  /**
   * Post-effects, post-limiter frequency spectrum (0-255 per bin) - "what
   * you actually hear", for driving visuals. Always live, independent of
   * the Adaptive Audio toggle. Pass a reusable array to avoid allocating
   * one every animation frame.
   */
  getFrequencyData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const out = target ?? new Uint8Array(this.outputAnalyser.frequencyBinCount)
    this.outputAnalyser.getByteFrequencyData(out)
    return out
  }

  /** Post-effects time-domain waveform (0-255, 128 = silence), for visuals. */
  getWaveformData(target?: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    const out = target ?? new Uint8Array(this.outputAnalyser.fftSize)
    this.outputAnalyser.getByteTimeDomainData(out)
    return out
  }

  async resumeContext(): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume()
  }

  async loadFile(file: File): Promise<void> {
    await this.resumeContext()
    this.teardownFileSource()

    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.src = url
    audio.crossOrigin = 'anonymous'
    setPreservesPitch(audio, false)

    audio.addEventListener('timeupdate', this.handleTimeUpdate)
    audio.addEventListener('loadedmetadata', this.handleTimeUpdate)
    audio.addEventListener('play', this.notify)
    audio.addEventListener('pause', this.notify)
    audio.addEventListener('ended', this.notify)

    this.audioEl = audio
    this.objectUrl = url
    this.fileName = file.name
    this.mediaSource = this.context.createMediaElementSource(audio)
    this.mediaSource.connect(this.fileSourceGain)

    this.demoPlaying = false
    this.setDemoEnabled(false)
    this.sourceMode = 'file'
    this.notify()
  }

  /** Loads a track bundled with the app (e.g. `/tracks/foo.mp3`) through the exact same path as a user-picked file. */
  async loadUrl(url: string, displayName: string): Promise<void> {
    const response = await fetch(url)
    const blob = await response.blob()
    const file = new File([blob], displayName, { type: blob.type || 'audio/mpeg' })
    await this.loadFile(file)
  }

  private teardownFileSource(): void {
    if (this.audioEl) {
      this.audioEl.pause()
      this.audioEl.removeEventListener('timeupdate', this.handleTimeUpdate)
      this.audioEl.removeEventListener('loadedmetadata', this.handleTimeUpdate)
      this.audioEl.removeEventListener('play', this.notify)
      this.audioEl.removeEventListener('pause', this.notify)
      this.audioEl.removeEventListener('ended', this.notify)
      this.audioEl.src = ''
      this.audioEl = null
    }
    if (this.mediaSource) {
      this.mediaSource.disconnect()
      this.mediaSource = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  async play(): Promise<void> {
    await this.resumeContext()
    if (this.sourceMode === 'file' && this.audioEl) {
      await this.audioEl.play()
    } else {
      // No file loaded (sourceMode is still 'none') - fall back to the demo
      // tone so pressing Play always produces audible feedback. Must flip
      // sourceMode to 'demo' here, or isPlaying() keeps reading 'none' and
      // stays stuck reporting false forever, which made Pause a no-op.
      this.sourceMode = 'demo'
      this.demoPlaying = true
      this.setDemoEnabled(true)
    }
    this.notify()
  }

  pause(): void {
    if (this.sourceMode === 'file' && this.audioEl) {
      this.audioEl.pause()
    } else {
      this.demoPlaying = false
      this.setDemoEnabled(false)
    }
    this.notify()
  }

  async togglePlayPause(): Promise<void> {
    const wasPlaying = this.isPlaying()
    if (wasPlaying) this.pause()
    else await this.play()
    this.flashFeedback(wasPlaying ? 'Pause' : 'Play')
  }

  seek(time: number): void {
    if (this.audioEl) this.audioEl.currentTime = clamp(time, 0, this.audioEl.duration || 0)
    this.notify()
  }

  setMasterVolume(value: number): void {
    this.volume = clamp(value, 0, 1)
    this.notify()
  }

  setDemoSignalEnabled(enabled: boolean): void {
    if (enabled) {
      this.teardownFileSource()
      this.sourceMode = 'demo'
      this.fileName = null
      this.demoPlaying = true
      this.setDemoEnabled(true)
    } else {
      this.demoPlaying = false
      this.setDemoEnabled(false)
      this.sourceMode = 'none'
    }
    this.notify()
  }

  setAdaptiveEnabled(enabled: boolean): void {
    this.adaptive.setEnabled(enabled)
    this.notify()
  }

  isPlaying(): boolean {
    if (this.sourceMode === 'file') return !!this.audioEl && !this.audioEl.paused
    if (this.sourceMode === 'demo') return this.demoPlaying
    return false
  }

  /** Advance time-based ramps (volume hold, speed smoothing) and adaptive analysis. Call every animation frame. */
  tick(nowMs: number): void {
    const dt = this.lastTickAt === null ? 1 / 60 : Math.min(0.1, (nowMs - this.lastTickAt) / 1000)
    this.lastTickAt = nowMs

    if (this.volumeRampDirection) {
      const delta = VOLUME_RAMP_PER_SECOND * dt * (this.volumeRampDirection === 'up' ? 1 : -1)
      this.volume = clamp(this.volume + delta, 0, 1)
    }
    this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, RAMP_TIME_CONSTANT)

    this.speedCurrent = lerp(this.speedCurrent, this.speedTarget, SPEED_TRACK_RATE)
    if (this.audioEl) this.audioEl.playbackRate = this.speedCurrent
    this.applyDemoRate(this.speedCurrent)

    const telemetry = this.adaptive.process()
    const ceiling = telemetry.wetCeiling

    const reverbTarget = this.reverbEnabled ? BASE_REVERB_WET * ceiling : 0
    this.reverbWet.gain.setTargetAtTime(reverbTarget, this.context.currentTime, RAMP_TIME_CONSTANT)

    const delayTarget = this.delayEnabled ? this.delayAmount * ceiling : 0
    this.delayWet.gain.setTargetAtTime(delayTarget, this.context.currentTime, RAMP_TIME_CONSTANT)
    // Extra feedback safety margin when the source is bass-heavy (ceiling drops -> pull feedback down too).
    const feedbackTarget = DELAY_FEEDBACK * clamp(0.5 + ceiling * 0.5, 0, 1)
    this.delayFeedback.gain.setTargetAtTime(feedbackTarget, this.context.currentTime, RAMP_TIME_CONSTANT)

    this.adaptiveGainComp.gain.setTargetAtTime(telemetry.gainCompensation, this.context.currentTime, RAMP_TIME_CONSTANT)

    this.notify()
  }

  getState(): EngineState {
    const filterParams = filterParamsFromValue(this.filterValue)
    return {
      contextState: this.context.state,
      sourceMode: this.sourceMode,
      fileName: this.fileName,
      isPlaying: this.isPlaying(),
      currentTime: this.audioEl?.currentTime ?? 0,
      duration: this.audioEl?.duration && Number.isFinite(this.audioEl.duration) ? this.audioEl.duration : 0,
      volume: this.volume,
      reverb: { enabled: this.reverbEnabled, wet: this.reverbWet.gain.value },
      delay: { enabled: this.delayEnabled, wet: this.delayWet.gain.value },
      filter: { value: this.filterValue, type: filterParams.type, frequency: this.filterNode.frequency.value },
      speed: { rate: this.speedCurrent },
      adaptive: this.adaptive.getSnapshot(),
      lastFeedback: this.lastFeedback,
    }
  }

  dispose(): void {
    this.unsubscribeBus()
    this.teardownFileSource()
    this.demoOscillators?.stop()
    void this.context.close()
    this.listeners.clear()
  }

  // ---------- command handling ----------

  private handleCommand(command: AnyCommand): void {
    switch (command.type) {
      case 'PLAY_PAUSE':
        void this.togglePlayPause()
        break
      case 'VOLUME_UP_START':
        this.volumeRampDirection = 'up'
        break
      case 'VOLUME_UP_END':
        if (this.volumeRampDirection === 'up') this.volumeRampDirection = null
        break
      case 'VOLUME_DOWN_START':
        this.volumeRampDirection = 'down'
        break
      case 'VOLUME_DOWN_END':
        if (this.volumeRampDirection === 'down') this.volumeRampDirection = null
        break
      case 'REVERB_TOGGLE':
        this.reverbEnabled = !this.reverbEnabled
        this.flashFeedback(`Reverb ${this.reverbEnabled ? 'On' : 'Off'}`)
        break
      case 'DELAY_TOGGLE':
        this.delayEnabled = !this.delayEnabled
        this.flashFeedback(`Delay ${this.delayEnabled ? 'On' : 'Off'}`)
        break
      case 'DELAY_AMOUNT':
        this.delayAmount = clamp(command.payload.value, 0, 1)
        break
      case 'FILTER_CHANGE':
        this.filterValue = clamp(command.payload.value, -1, 1)
        this.applyFilterImmediate()
        break
      case 'SPEED_CHANGE':
        this.speedTarget = rateFromSpeedValue(clamp(command.payload.value, -1, 1))
        break
    }
    // No notify() here on purpose. The tick() loop already calls notify()
    // every animation frame regardless, so this would just be a duplicate,
    // same-frame re-render - and DELAY_AMOUNT/FILTER_CHANGE/SPEED_CHANGE
    // fire on *every tracked hand frame* while a right-hand pinch is held,
    // which was doubling React's render rate for the whole app during
    // continuous right-hand gestures. On mobile, with hand-tracking
    // inference already competing for the main thread, that was enough
    // contention to stutter both the UI and (via decode starvation) audio
    // playback. Any state change here shows up within one frame (~16ms)
    // via the next tick() anyway - imperceptible, and much cheaper.
  }

  private applyFilterImmediate(): void {
    const { type, frequency } = filterParamsFromValue(this.filterValue)
    if (this.filterNode.type !== type) this.filterNode.type = type
    this.filterNode.frequency.setTargetAtTime(frequency, this.context.currentTime, RAMP_TIME_CONSTANT)
  }

  private flashFeedback(message: string): void {
    this.lastFeedback = { message, at: Date.now() }
  }

  // ---------- demo signal (works with no file loaded, for testing gestures) ----------

  private startDemoOscillators(): void {
    const ctx = this.context
    const osc1 = ctx.createOscillator()
    osc1.type = 'sawtooth'
    osc1.frequency.value = 110
    const osc2 = ctx.createOscillator()
    osc2.type = 'triangle'
    osc2.frequency.value = 164.81 // fifth above

    const mix = ctx.createGain()
    mix.gain.value = 0.18
    osc1.connect(mix)
    osc2.connect(mix)
    mix.connect(this.demoSourceGain)

    osc1.start()
    osc2.start()

    this.demoOscillators = {
      stop: () => {
        osc1.stop()
        osc2.stop()
      },
    }
    this.demoBaseFrequencies = [110, 164.81]
    this.demoOscNodes = [osc1, osc2]
  }

  private demoBaseFrequencies: number[] = []
  private demoOscNodes: OscillatorNode[] = []

  private applyDemoRate(rate: number): void {
    this.demoOscNodes.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(this.demoBaseFrequencies[i] * rate, this.context.currentTime, RAMP_TIME_CONSTANT)
    })
  }

  private setDemoEnabled(enabled: boolean): void {
    this.demoSourceGain.gain.setTargetAtTime(enabled ? 1 : 0, this.context.currentTime, RAMP_TIME_CONSTANT)
  }

  // ---------- internal ----------

  private handleTimeUpdate = (): void => {
    this.notify()
  }

  private notify = (): void => {
    const state = this.getState()
    for (const l of this.listeners) l(state)
  }
}

function setPreservesPitch(audio: HTMLAudioElement, preserve: boolean): void {
  // Explicitly opt OUT of pitch preservation so playbackRate produces a DJ-style
  // speed+pitch coupling instead of the browser's default time-stretched pitch correction.
  const el = audio as HTMLAudioElement & {
    preservesPitch?: boolean
    mozPreservesPitch?: boolean
    webkitPreservesPitch?: boolean
  }
  el.preservesPitch = preserve
  el.mozPreservesPitch = preserve
  el.webkitPreservesPitch = preserve
}
