export interface PresetTrack {
  id: string
  title: string
  artist: string
  /** Path under public/, served as-is by Vite. */
  url: string
}

/**
 * Locally-provided tracks the user can pick without going through the file
 * dialog. Most of public/tracks/ is gitignored (personal copies of
 * commercial songs, for local testing only) - the one exception is
 * "demo-tape", the project owner's own original track, which is
 * explicitly un-ignored in .gitignore and shipped with the repo.
 */
export const PRESET_TRACKS: PresetTrack[] = [
  { id: 'demo-tape', title: '똥하우스 130 (Demo Tape)', artist: 'poopfactory', url: '/tracks/ddonghouse-130.mp3' },
  { id: 'topia-twins', title: 'Topia Twins', artist: '', url: '/tracks/topia-twins.mp3' },
  { id: 'gods-plan', title: "God's Plan", artist: 'Drake', url: '/tracks/gods-plan.mp3' },
  { id: 'hotline-bling', title: 'Hotline Bling', artist: 'Drake', url: '/tracks/hotline-bling.mp3' },
]
