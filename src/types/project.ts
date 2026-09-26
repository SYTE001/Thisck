import type { LyricLine, TrackMetadata, TimingSource } from './lyrics';

export interface StyleConfig {
  presetName: 'Editorial Burgundy' | 'Cream Editorial' | 'Midnight Vintage' | 'Custom';
  primaryBg: string; // e.g. #3A0505 or #5B0B0B
  secondaryBg: string; // e.g. #F4E7D3
  primaryTextColor: string; // e.g. #F1D39A
  secondaryTextColor: string; // e.g. #3A0505
  accentColor: string; // e.g. #8D6650
  fontFamily: 'Cormorant Garamond' | 'Playfair Display' | 'DM Serif Display' | 'Libre Baskerville';
  fontSizeRatio: number; // 0.8 - 1.5, default 1.0
  lineHeight: number; // default 1.15
  letterSpacing: number; // in px
  textAlign: 'center' | 'left';
  grainIntensity: number; // 0.0 to 1.0, default 0.18
  vignetteIntensity: number; // 0.0 to 1.0, default 0.25
  alternatingScenes: boolean; // alternate burgundy / cream
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
