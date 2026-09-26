import type { LyricLine, TrackMetadata, TimingSource } from './lyrics';

export type ActiveTab = 'projects' | 'lyrics' | 'timeline' | 'design' | 'preview' | 'export' | 'settings';

export type PresetName = 
  | 'Deep Forest' 
  | 'Olive Editorial' 
  | 'Sand Paper' 
  | 'Off White Editorial' 
  | 'Editorial Burgundy' 
  | 'Cream Editorial' 
  | 'Midnight Vintage' 
  | 'Custom';

export interface StyleConfig {
  presetName: PresetName | string;
  primaryBg: string;
  secondaryBg: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  accentColor: string;
  fontFamily: 'Cormorant Garamond' | 'Playfair Display' | 'DM Serif Display' | 'Libre Baskerville' | string;
  fontSizeRatio: number; // 0.8 - 1.5, default 1.0
  lineHeight: number; // default 1.15
  letterSpacing: number; // in px
  textAlign: 'center' | 'left';
  grainIntensity: number; // 0.0 to 1.0, default 0.18
  vignetteIntensity: number; // 0.0 to 1.0, default 0.25
  alternatingScenes: boolean; // alternate primary / secondary
  showStarDecoration: boolean; // 4-point star at bottom
  maxLinesOnScreen: number; // 1 or 2, default 2
  showSupportingLyrics?: boolean;
  supportingLyricPolicy?: 'AUTO' | 'ALWAYS' | 'NEVER';
}

export interface ExportSettings {
  width: number; // default 1080
  height: number; // default 1920
  aspectRatio: '9:16' | '1:1' | '16:9';
  fps: 24 | 30 | 60;
  bitrateKbps: number; // default 8000
  includeAudio: boolean; // true if project audio exists, false for silent MP4
  format: 'mp4' | 'webm';
}

export interface AudioTrackState {
  enabled: boolean;
  source: 'USER_UPLOAD' | 'NONE';
  fileName: string | null;
  duration: number | null;
  audioBlobUrl: string | null;
  audioBuffer?: AudioBuffer | null;
  peaks?: number[]; // for waveform display
}

export interface ProjectState {
  version: 1;
  id: string;
  name: string;
  updatedAt: string;
  track: TrackMetadata;
  lines: LyricLine[];
  style: StyleConfig;
  exportSettings: ExportSettings;
  timingSource: TimingSource;
  maxHoldDurationSec: number; // default 4.5s for lines without explicit end time
}
