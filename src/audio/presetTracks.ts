export interface PresetTrack {
  id: string
  title: string
  artist: string
  /** Path under public/, served as-is by Vite. */
  url: string
}

/**
 * Locally-provided tracks the user can pick without going through the file
 * dialog. Files live in public/tracks/ and are gitignored - they're the
 * user's own local audio, not shipped with the project.
 */
export const PRESET_TRACKS: PresetTrack[] = [
  { id: 'topia-twins', title: 'Topia Twins', artist: '', url: '/tracks/topia-twins.mp3' },
  { id: 'gods-plan', title: "God's Plan", artist: 'Drake', url: '/tracks/gods-plan.mp3' },
  { id: 'hotline-bling', title: 'Hotline Bling', artist: 'Drake', url: '/tracks/hotline-bling.mp3' },
]
