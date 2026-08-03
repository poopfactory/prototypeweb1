/**
 * Synthesizes a plate-reverb-ish impulse response entirely in code (noise
 * shaped by an exponential decay envelope) so the reverb effect needs no
 * external audio asset.
 */
export function generateImpulseResponse(
  context: BaseAudioContext,
  durationSeconds = 2.4,
  decay = 3.2,
): AudioBuffer {
  const sampleRate = context.sampleRate
  const length = Math.max(1, Math.floor(sampleRate * durationSeconds))
  const buffer = context.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      const t = i / length
      const envelope = Math.pow(1 - t, decay)
      data[i] = (Math.random() * 2 - 1) * envelope
    }
  }

  return buffer
}
